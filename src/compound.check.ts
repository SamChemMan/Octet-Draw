// Run: node src/compound.check.ts. A compound written as changes to an earlier compound (compound.ts and its place in
// the AI apps' tools, mcp.ts; docs/plans/mcp-v2.md section 4; test plan C1 to C4 and C12), with no window
// (scripts/headless) and Indigo as the app runs it. Each change kind on substrates of different kinds: the result's
// InChIKey and CIP labels against a SMILES written by hand. Then what a reply says of a stereocentre, map numbers kept
// and never written, the refusals, each tool that takes a compound, the layout kept, Nicolaou's taxol route in the
// new form, and the time against reading the same compounds from SMILES.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

if (!existsSync(new URL("./vendor/opsin/opsin.js", import.meta.url))) { console.log("compound.check: skipped (no OPSIN build)"); process.exit(0); }
const { load, drawing, session } = await import("../scripts/headless/host.ts");
const { handle } = await import("./mcp.ts");
const { change, tagged } = await import("./compound.ts");
const { parseStructure, stereoLabels, toInchiKey, expandLabels } = await import("./chem.ts");
const { fragments, pickAtoms } = await import("./edit.ts");
type Mol = import("./render.ts").Mol;
await load();

let d = drawing(), n = 0;
const call = async (name: string, args: unknown) => JSON.parse(await handle(JSON.stringify({ jsonrpc: "2.0", id: ++n, method: "tools/call", params: { name, arguments: args } }), () => d.host, "1", session("Check", "compound"))).result;
const said = (r: { content: { text: string }[] }) => r.content[0].text.split("\n")[0];
// The session's brief first (plan 3.1): these drawings are for a paper.
assert.ok(!(await call("set_brief", { destination: { kind: "paper" } })).isError);
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
  // Which of a group, as the user says it: both or all, or the class of the carbon it is on.
  { what: "both hydroxyls", from: "C[C@H](O)C[C@@](C)(O)CC", changes: [{ swap: { "both OH": "OTBS" } }], want: "C[C@H](O[Si](C)(C)C(C)(C)C)C[C@@](C)(O[Si](C)(C)C(C)(C)C)CC", says: /Changed both OH to OTBS\./ },
  { what: "all three hydroxyls", from: "OC[C@@H](O)C[C@@](C)(O)CC", changes: [{ swap: { "all OH": "OAc" } }], want: "CC(=O)OC[C@@H](OC(C)=O)C[C@@](C)(OC(C)=O)CC", says: /Changed all 3 OH to OAc\./ },
  { what: "the secondary of two silyl ethers", from: "C[C@H](*)C[C@@](C)(*)CC", labels: ["OTBS", "OTBS"], changes: [{ swap: { "2° OTBS": "OH" } }], want: "C[C@H](O)C[C@@](C)(O[Si](C)(C)C(C)(C)C)CC" },
  { what: "the tertiary of two, written t-", from: "C[C@H](*)C[C@@](C)(*)CC", labels: ["OTBS", "OTBS"], changes: [{ swap: { "t-OTBS": "OH" } }], want: "C[C@H](O[Si](C)(C)C(C)(C)C)C[C@@](C)(O)CC" },
  { what: "the primary of two hydroxyls, as the place of set", from: "OC[C@@H](O)CC", changes: [{ at: "prim OH", set: "OTBS" }], want: "CC[C@H](O)CO[Si](C)(C)C(C)(C)C" },
  { what: "both secondary of three hydroxyls, then the one left", from: "C[C@H](O)C[C@@H](O)C[C@@](C)(O)CC", changes: [{ swap: { "both 2° OH": "OBn" } }, { swap: { OH: "OMe" } }], want: "C[C@H](OCc1ccccc1)C[C@@H](OCc1ccccc1)C[C@@](C)(OC)CC" },
  { what: "a lactone reduced by its kind, beside an ester", from: "CCOC(=O)C[C@H]1CCC(=O)O1", changes: [{ do: "reduce", at: "lactone" }], want: "CCOC(=O)C[C@H](O)CCCO" },
  { what: "an ester reduced by its kind, beside a lactone", from: "CCOC(=O)C[C@H]1CCC(=O)O1", changes: [{ do: "reduce", at: "ester" }], want: "OCC[C@H]1CCC(=O)O1" },
  // A kind is each kind of C=O (a ketone too), in any letters, and a CO2Et label is an ester.
  { what: "a ketone reduced by its kind, beside an ester", from: "CC(=O)CCC(=O)OC", changes: [{ do: "reduce", at: "ketone" }], want: "CC(O)CCC(=O)OC" },
  { what: "an ester named with a capital", from: "CC(=O)CCC(=O)OC", changes: [{ do: "reduce", at: "Ester" }], want: "CC(=O)CCCO" },
  { what: "an ester label reduced by its kind, beside a ketone", from: "CC(=O)CC*", labels: ["CO2Et"], changes: [{ do: "reduce", at: "ester" }], want: "CC(=O)CCCO" },
  // The class in full, as the refusal says it; all of a class with one there says one; p- of a group on an arene is
  // para, not primary.
  { what: "the tertiary of two hydroxyls, in full", from: "C[C@H](O)C[C@@](C)(O)CC", changes: [{ swap: { "tertiary OH": "OAc" } }], want: "C[C@H](O)C[C@@](C)(OC(C)=O)CC" },
  { what: "all secondary hydroxyls, one there", from: "C[C@H](O)C[C@@](C)(O)CC", changes: [{ swap: { "all 2° OH": "OAc" } }], want: "C[C@H](OC(C)=O)C[C@@](C)(O)CC", says: /Changed one 2° OH to OAc\./ },
  { what: "the primary alcohol beside a phenol", from: "Oc1ccc(CCO)cc1", changes: [{ swap: { "1° OH": "OAc" } }], want: "Oc1ccc(CCOC(C)=O)cc1" },
  { what: "a para methoxy, p-", from: "COc1ccc(C)cc1", changes: [{ swap: { "p-OMe": "OH" } }], want: "Oc1ccc(C)cc1" },
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
  assert.match((change(from, [{ at: "3", set: "OH" }]) as { notes: string[] }).notes.join(" "), /Atom 3 is now a stereocentre with no configuration: to set one, give config \(\{'3': 'R'\}\)/);
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
// so: it may be a slip (C12). A generic group (R), and another stand-in written alone or round one (Alkyl, OAr), is one
// on purpose (labels.ts unknownLabel), and a group Octet reads needs no word.
{
  d = drawing();
  const r = await call("draw", { kind: "structures", structures: [{ text: "CCO", number: "1" }, { from: "1", changes: [{ swap: { OH: "OTBDSP" } }], number: "2" }, { from: "1", changes: [{ swap: { OH: "R" } }], number: "3" }, { from: "1", changes: [{ swap: { OH: "OTBDPS" } }], number: "4" }, { from: "1", changes: [{ swap: { OH: "Alkyl" } }], number: "5" }, { from: "1", changes: [{ swap: { OH: "OAr" } }], number: "6" }] });
  assert.ok(!r.isError, said(r));
  assert.match(said(r), /\(2\) \[Octet cannot read OTBDSP as a group: it is drawn as a label with no structure\.\]/);
  assert.ok(!/\(([3-6])\) \[/.test(said(r)), said(r));
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
  await refuse({ text: "*C1CCC(*)CC1", labels: ["OTBS", "OTBS"] }, [{ swap: { OTBS: "OH" } }], /in the order of the compound's atoms\), or write both OTBS\.$/);
  await refuse({ text: "*C1CCC(*)CC1", labels: ["OTBS", "OTBS"] }, [{ swap: { OTBS: "OH" }, occurrence: 3 }], /there are 2 OTBS, so no occurrence 3/);
  // On carbons of two classes, the classes are said, so the AI app's next call is right; a class or both that does
  // not fit is refused with what is there.
  const classes = { text: "C[C@H](*)C[C@@](C)(*)CC", labels: ["OTBS", "OTBS"] };
  await refuse(classes, [{ swap: { OTBS: "OH" } }], /changes\[0\]: OTBS is on a secondary carbon and a tertiary carbon: write 2° OTBS or 3° OTBS for one, or both OTBS\./);
  await refuse(classes, [{ at: "OTBS", remove: true }], /OTBS is on a secondary carbon and a tertiary carbon/);
  await refuse(classes, [{ swap: { "1° OTBS": "OH" } }], /there is no 1° OTBS: OTBS is on a secondary carbon and a tertiary carbon\./);
  await refuse({ text: "OC[C@@H](O)C[C@@](C)(O)CC" }, [{ swap: { "both OH": "OAc" } }], /both is for 2, and there are 3 OH/);
  await refuse({ text: "C[C@H](O)C[C@@H](O)C[C@@](C)(O)CC" }, [{ swap: { "2° OH": "OAc" } }], /there are two 2° OH \(on atom #1, atom #4\): say which with occurrence \(1 to 2, in the order of the compound's atoms\), or write both 2° OH\./);
  // Two of one class are said once, with how many; a phenol's carbon is an aryl carbon, with no class, so 2° OH is not
  // the phenol; both or all goes with no occurrence.
  await refuse({ text: "C[C@H](O)C[C@@H](O)C" }, [{ swap: { "1° OH": "OAc" } }], /there is no 1° OH: OH is on two secondary carbons\.$/);
  await refuse({ text: "C[C@H](O)C[C@@H](O)CC(C)(C)O" }, [{ swap: { OH: "OAc" } }], /^Octet drew nothing\. .*OH is on two secondary carbons and a tertiary carbon: write 3° OH for one, or all OH, or say which/);
  await refuse({ text: "Oc1ccc(CCO)cc1" }, [{ swap: { OH: "OAc" } }], /OH is on a primary carbon and an aryl carbon: write 1° OH for one, or both OH, or say which with occurrence/);
  await refuse({ text: "Oc1ccc(CCO)cc1" }, [{ swap: { "2° OH": "OAc" } }], /there is no 2° OH: OH is on a primary carbon and an aryl carbon\./);
  await refuse({ text: "COc1ccc(OC)cc1" }, [{ swap: { "p-OMe": "OH" } }], /there are 2 OMe \(on atom #2, atom #5\)/);
  await refuse(classes, [{ swap: { "both OTBS": "OH" }, occurrence: 1 }], /occurrence does not go with both/);
  await refuse({ text: "CC(=O)CCC(=O)OC" }, [{ do: "reduce", at: "aldehyde" }], /reduce fits no aldehyde in this compound, only a ketone and an ester\./);
  await refuse({ text: "CCOC(=O)CCC" }, [{ do: "reduce", at: "lactone" }], /reduce fits no lactone in this compound/);
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
  await refuse({ text: "C[CH2:1][CH2:2]C" }, [{ bond: "1-2", to: "double" }], /The new double bond between atom 1 and atom 2 can be E or Z: say which with config \(\{'1-2': 'E'\} or 'Z'\)/);
  await refuse({ text: "C[C:1]#[C:2]C" }, [{ bond: "1-2", to: "double" }], /can be E or Z/);
  await refuse({ text: "C[CH2:1]C[CH2:2]O" }, [{ bond: "1-2", to: "double" }], /atom 1 and atom 2 are not bonded: bond changes a bond's order\. To make a bond, give \{do: 'close'\} in one compound, or \{do: 'join'\} to another/);
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
  await refuse(lactate, [{ at: "2" }], /changes\[0\]: give one of swap, set, add, remove: true, bond with to, or do/);
  await refuse(lactate, [{ at: "2", set: "OH", remove: true }], /give one of swap/);
  await refuse(lactate, [{ swap: { OH: 5 } }], /5 is not a group/);
  await refuse(lactate, [{ at: "2", set: "O H" }], /O H is not a group/);
  await refuse(lactate, [{ set: "OH" }], /say where with at/);
  await refuse(lactate, [{ swap: { OH: "OAc" }, occurence: 1 }], /occurence is not part of a change \(swap, occurrence, at, set, add, remove, bond, to, do, with, config\)/);
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

// ---- Named transformations (C5; plan section 4.3): each on substrates of different kinds ----

// A row: the substrate, the changes, and the product as a SMILES written by hand from the substrate's own (each atom
// in its place, so a centre the change leaves has the neighbours in the order it had). The product drawn must have
// that InChIKey and those CIP labels. Where config asks for a label, the product's SMILES has the same number on that
// atom, and the label is first read from that SMILES itself: the row is then right whatever compound.ts does.
// other: the compound a join takes, numbered 9.
type Made = [what: string, from: string, changes: { do?: string; config?: unknown }[], want: string, more?: { labels?: string[]; other?: string }];
const MADE: Made[] = [
  // protect: each group, on alcohols, a phenol, amines and diols.
  ["TBS on one of two alcohols", "C[C@H:2](O)CCO", [{ do: "protect", with: "TBS", at: "2" }], "C[C@H](O[Si](C)(C)C(C)(C)C)CCO"],
  ["TBDPS on a primary alcohol", "OC[C@@H](C)c1ccccc1", [{ do: "protect", with: "TBDPS" }], "CC(C)(C)[Si](c1ccccc1)(c1ccccc1)OC[C@@H](C)c1ccccc1"],
  ["TES on a phenol", "Oc1ccc(C)cc1", [{ do: "protect", with: "TES" }], "CC[Si](CC)(CC)Oc1ccc(C)cc1"],
  ["TMS on a tertiary alcohol", "CC(C)(O)C#C", [{ do: "protect", with: "TMS" }], "CC(C)(O[Si](C)(C)C)C#C"],
  ["TIPS on a propargyl alcohol", "OCC#C", [{ do: "protect", with: "TIPS" }], "CC(C)[Si](C(C)C)(C(C)C)OCC#C"],
  ["Bn on a ring alcohol beside two centres", "C[C@@H]1O[C@H](OC)C[C@H:3]1O", [{ do: "protect", with: "Bn", at: "3" }], "C[C@@H]1O[C@H](OC)C[C@H]1OCc1ccccc1"],
  ["PMB on an alcohol with a tertiary amine", "OCCN1CCCC1", [{ do: "protect", with: "PMB" }], "COc1ccc(COCCN2CCCC2)cc1"],
  ["MOM on a benzylic alcohol", "O[C@H](C)c1ccccc1", [{ do: "protect", with: "MOM" }], "COCO[C@H](C)c1ccccc1"],
  ["Ac on an amino ester", "N[C@@H](C)C(=O)OC", [{ do: "protect", with: "Ac" }], "CC(=O)N[C@@H](C)C(=O)OC"],
  ["Bz on cyclohexanol", "OC1CCCCC1", [{ do: "protect", with: "Bz" }], "O=C(OC1CCCCC1)c1ccccc1"],
  ["Boc on a ring nitrogen, by its number", "OC(=O)[C@@H]1CCC[NH:1]1", [{ do: "protect", with: "Boc", at: "1" }], "OC(=O)[C@@H]1CCCN1C(=O)OC(C)(C)C"],
  ["Cbz on a primary amine", "NCCc1ccccc1", [{ do: "protect", with: "Cbz" }], "O=C(OCc1ccccc1)NCCc1ccccc1"],
  ["Fmoc on an amino ester", "N[C@@H](CC(C)C)C(=O)OC", [{ do: "protect", with: "Fmoc" }], "O=C(OCC1c2ccccc2-c2ccccc21)N[C@@H](CC(C)C)C(=O)OC"],
  ["an acetonide on a ring's cis diol", "O[C@H:1]1CCCC[C@H:2]1O", [{ do: "protect", with: "acetonide", at: "1-2" }], "CC1(C)O[C@H]2CCCC[C@H]2O1"],
  ["an acetonide on a 1,3-diol", "O[CH2:1]C(C)(C)[CH2:3]O", [{ do: "protect", with: "acetonide", at: "1-3" }], "CC1(C)OCC(C)(C)CO1"],
  ["an acetonide on a chain's diol with a centre", "O[CH2:1][C@H:2](O)c1ccccc1", [{ do: "protect", with: "acetonide", at: "1-2" }], "CC1(C)OC[C@H](O1)c1ccccc1"],
  ["a carbonate on a chain's diol", "O[CH2:1][C@H:2](O)CC", [{ do: "protect", with: "carbonate", at: "1-2" }], "O=C1OC[C@H](O1)CC"],
  // deprotect: each group, written as a label or drawn atom by atom.
  ["TBS off, written as a label", "C[C@H](*)CCO", [{ do: "deprotect", with: "TBS" }], "C[C@H](O)CCO", { labels: ["OTBS"] }],
  ["TBS off, drawn atom by atom", "C[C@@H](O)CO[Si](C)(C)C(C)(C)C", [{ do: "deprotect", with: "TBS" }], "C[C@@H](O)CO"],
  ["one of two TBS off, by its atom", "CC(C)(C)[Si](C)(C)O[CH2:1]C[CH2:3]O[Si](C)(C)C(C)(C)C", [{ do: "deprotect", with: "TBS", at: "1" }], "OCCCO[Si](C)(C)C(C)(C)C"],
  ["TBDPS off", "CC(C)(C)[Si](c1ccccc1)(c1ccccc1)OCC=C", [{ do: "deprotect", with: "TBDPS" }], "OCC=C"],
  ["TES off", "CC[Si](CC)(CC)OC1CCCCC1", [{ do: "deprotect", with: "TES" }], "OC1CCCCC1"],
  ["TMS off", "C[Si](C)(C)OC(C)(C)C#C", [{ do: "deprotect", with: "TMS" }], "OC(C)(C)C#C"],
  ["TIPS off a phenol", "CC(C)[Si](C(C)C)(C(C)C)Oc1ccccc1", [{ do: "deprotect", with: "TIPS" }], "Oc1ccccc1"],
  ["Bn off a lactate", "C[C@@H](OCc1ccccc1)C(=O)OC", [{ do: "deprotect", with: "Bn" }], "C[C@@H](O)C(=O)OC"],
  ["PMB off", "COc1ccc(COCCCC)cc1", [{ do: "deprotect", with: "PMB" }], "OCCCC"],
  ["MOM off", "COCO[C@H](C)c1ccccc1", [{ do: "deprotect", with: "MOM" }], "O[C@H](C)c1ccccc1"],
  ["Ac off a nitrogen", "CC(=O)Nc1ccccc1", [{ do: "deprotect", with: "Ac" }], "Nc1ccccc1"],
  ["Ac off, written as a label in CH2OAc", "*c1ccccc1", [{ do: "deprotect", with: "Ac" }], "OCc1ccccc1", { labels: ["CH2OAc"] }],
  ["Bz off", "O=C(O[C@@H](C)CC)c1ccccc1", [{ do: "deprotect", with: "Bz" }], "O[C@@H](C)CC"],
  ["Boc off a proline ester", "CC(C)(C)OC(=O)N1CCC[C@H]1C(=O)OC", [{ do: "deprotect", with: "Boc" }], "N1CCC[C@H]1C(=O)OC"],
  ["Boc off, written as a label", "*[C@@H](C)C(=O)OC", [{ do: "deprotect", with: "Boc" }], "N[C@@H](C)C(=O)OC", { labels: ["NHBoc"] }],
  ["Cbz off an amino acid", "O=C(OCc1ccccc1)N[C@@H](C)C(=O)O", [{ do: "deprotect", with: "Cbz" }], "N[C@@H](C)C(=O)O"],
  ["Fmoc off glycine", "O=C(OCC1c2ccccc2-c2ccccc21)NCC(=O)O", [{ do: "deprotect", with: "Fmoc" }], "NCC(=O)O"],
  ["an acetonide off", "CC1(C)OC[C@H](O1)c1ccccc1", [{ do: "deprotect", with: "acetonide" }], "OC[C@H](O)c1ccccc1"],
  ["a carbonate off", "O=C1OC[C@H](O1)CC", [{ do: "deprotect", with: "carbonate" }], "OC[C@H](O)CC"],
  // acetylate, benzoylate, form_carbonate.
  ["an alcohol acetylated", "O[C@H](C)CC", [{ do: "acetylate" }], "CC(=O)O[C@H](C)CC"],
  ["an aniline acetylated", "Nc1ccccc1", [{ do: "acetylate" }], "CC(=O)Nc1ccccc1"],
  ["one alcohol of a diol acetylated", "O[CH2:1]C(C)(C)O", [{ do: "acetylate", at: "1" }], "CC(=O)OCC(C)(C)O"],
  ["an alcohol benzoylated", "OCC1CCCCC1", [{ do: "benzoylate" }], "O=C(OCC1CCCCC1)c1ccccc1"],
  ["an amine benzoylated", "C[C@H](N)c1ccccc1", [{ do: "benzoylate" }], "C[C@H](NC(=O)c1ccccc1)c1ccccc1"],
  ["a ring's cis diol to its carbonate", "O[C@H:1]1CCCC[C@H:2]1O", [{ do: "form_carbonate", at: "1-2" }], "O=C1O[C@H]2CCCC[C@H]2O1"],
  // esterify.
  ["an acid to its methyl ester", "OC(=O)[C@@H](C)c1ccccc1", [{ do: "esterify", with: "Me" }], "COC(=O)[C@@H](C)c1ccccc1"],
  ["the acid of a hydroxy acid, with no at", "OCC[C@H](C)CC(=O)O", [{ do: "esterify", with: "Et" }], "OCC[C@H](C)CC(=O)OCC"],
  ["an acid to its benzyl ester", "OC(=O)CCC", [{ do: "esterify", with: "Bn" }], "O=C(CCC)OCc1ccccc1"],
  ["an acid to its tert-butyl ester (OtBu is a label Octet reads)", "OC(=O)CCC", [{ do: "esterify", with: "tBu" }], "CCCC(=O)OC(C)(C)C"],
  ["an acid written as a label", "*c1ccccc1", [{ do: "esterify", with: "Me" }], "COC(=O)c1ccccc1", { labels: ["CO2H"] }],
  ["an alcohol, by its atom, with an acyl group", "O[CH2:1]CC", [{ do: "esterify", with: "Ac", at: "1" }], "CC(=O)OCCC"],
  // hydrolyse.
  ["a methyl ester to its acid", "COC(=O)CCc1ccccc1", [{ do: "hydrolyse" }], "OC(=O)CCc1ccccc1"],
  ["an acetate to its alcohol", "CC(=O)O[C@H](C)CCc1ccccc1", [{ do: "hydrolyse" }], "O[C@H](C)CCc1ccccc1"],
  ["a lactone to its hydroxy acid", "O=C1CC[C@H](C)CO1", [{ do: "hydrolyse" }], "OC(=O)CC[C@H](C)CO"],
  ["a carbonate to its diol", "O=C1O[C@H]2CCCC[C@H]2O1", [{ do: "hydrolyse" }], "O[C@H]1CCCC[C@H]1O"],
  ["a silyl ether", "C[Si](C)(C)OCCC=C", [{ do: "hydrolyse" }], "OCCC=C"],
  ["an ester written as a label", "*CCc1ccccc1", [{ do: "hydrolyse" }], "OC(=O)CCc1ccccc1", { labels: ["CO2Et"] }],
  ["an acetate written as a label", "C[C@H](*)CC", [{ do: "hydrolyse" }], "C[C@H](O)CC", { labels: ["OAc"] }],
  ["an acetonide", "CC1(C)OCC(C)(C)CO1", [{ do: "hydrolyse" }], "OCC(C)(C)CO"],
  ["one ester of two, by its carbon", "COC(=O)CC[C:1](=O)OCC", [{ do: "hydrolyse", at: "1" }], "COC(=O)CCC(=O)O"],
  ["the alcohol of a small ester, by its atom", "CC(=O)O[CH2:1]C", [{ do: "hydrolyse", at: "1" }], "OCC"],
  // oxidise.
  ["a primary alcohol to its aldehyde", "OCCc1ccccc1", [{ do: "oxidise" }], "O=CCc1ccccc1"],
  ["a ring's secondary alcohol, with two centres left", "C[C@H]1CC[CH:4](O)C[C@@H]1C", [{ do: "oxidise" }], "C[C@H]1CCC(=O)C[C@@H]1C"],
  ["an aldehyde to its acid", "O=CCCC", [{ do: "oxidise" }], "OC(=O)CCC"],
  ["an alcohol to its acid, in two", "OCCCC", [{ do: "oxidise" }, { do: "oxidise" }], "OC(=O)CCC"],
  ["CH2OH written as a label", "*[C@H](C)c1ccccc1", [{ do: "oxidise" }], "O=C[C@H](C)c1ccccc1", { labels: ["CH2OH"] }],
  ["CHO written as a label", "*c1ccccc1", [{ do: "oxidise" }], "OC(=O)c1ccccc1", { labels: ["CHO"] }],
  ["one alcohol of two, by its atom", "O[CH2:1]CC[C@H:4](O)C", [{ do: "oxidise", at: "4" }], "OCCCC(=O)C"],
  // reduce.
  ["a ketone to its alcohol, with no configuration", "CC(=O)c1ccccc1", [{ do: "reduce" }], "CC(O)c1ccccc1"],
  ["a ketone to one alcohol", "C[C:2](=O)CCC(=O)OC", [{ do: "reduce", at: "2", config: "S" }], "C[C@H:2](O)CCC(=O)OC"],
  ["a ketone to the other alcohol", "C[C:2](=O)CCC(=O)OC", [{ do: "reduce", at: "2", config: "R" }], "C[C@@H:2](O)CCC(=O)OC"],
  ["an ester to its alcohol", "COC(=O)[C@@H](C)c1ccccc1", [{ do: "reduce" }], "OC[C@@H](C)c1ccccc1"],
  ["a lactone to its diol", "O=C1CC[C@H](C)CO1", [{ do: "reduce" }], "OCCC[C@H](C)CO"],
  ["an acid to its alcohol", "OC(=O)CCc1ccccc1", [{ do: "reduce" }], "OCCCc1ccccc1"],
  ["an aldehyde to its alcohol", "O=CCc1ccccc1", [{ do: "reduce" }], "OCCc1ccccc1"],
  ["an ester written as a label", "*[C@@]1(C)CCCC[C@H]1O", [{ do: "reduce" }], "OC[C@@]1(C)CCCC[C@H]1O", { labels: ["CO2Et"] }],
  ["an acetate reduced off its alcohol", "CC(=O)OCCCCc1ccccc1", [{ do: "reduce" }], "OCCCCc1ccccc1"],
  // hydrogenate.
  ["an alkene", "C=CCO", [{ do: "hydrogenate" }], "CCCO"],
  ["an alkyne", "CC#CCO", [{ do: "hydrogenate" }], "CCCCO"],
  ["a styrene's alkene, not its ring", "C=Cc1ccccc1", [{ do: "hydrogenate" }], "CCc1ccccc1"],
  ["an allyl group, not the indole it is on", "C=CCn1ccc2ccccc12", [{ do: "hydrogenate" }], "CCCn1ccc2ccccc12"],
  ["one alkene of a diene, by its atoms", "C=C[CH:3]=[CH:4]C", [{ do: "hydrogenate", at: "3-4" }], "C=CCCC"],
  // epoxidise.
  ["cyclohexene to its oxide", "C1CC=CCC1", [{ do: "epoxidise" }], "C1CC2OC2CC1"],
  ["a ring alkene to one epoxide", "C[C@@H]1C[CH:3]=[CH:4]CC1", [{ do: "epoxidise", config: { 3: "R", 4: "S" } }], "C[C@@H]1C[C@H:3]2O[C@H:4]2CC1"],
  ["the same alkene to the other epoxide", "C[C@@H]1C[CH:3]=[CH:4]CC1", [{ do: "epoxidise", config: { 3: "S", 4: "R" } }], "C[C@@H]1C[C@@H:3]2O[C@@H:4]2CC1"],
  ["a styrene", "C=Cc1ccccc1", [{ do: "epoxidise" }], "C1OC1c1ccccc1"],
  ["an enone's alkene", "CC(=O)C=C(C)C", [{ do: "epoxidise" }], "CC(=O)C1OC1(C)C"],
  // dihydroxylate.
  ["a terminal alkene", "C=CCc1ccccc1", [{ do: "dihydroxylate" }], "OCC(O)Cc1ccccc1"],
  ["a ring alkene to one diol", "C[C@@H]1C[CH:3]=[CH:4]CC1", [{ do: "dihydroxylate", config: { 3: "R", 4: "S" } }], "C[C@@H]1C[C@@H:3](O)[C@@H:4](O)CC1"],
  ["a trisubstituted alkene", "CC=C(C)C", [{ do: "dihydroxylate" }], "CC(O)C(C)(C)O"],
  // hydroborate.
  ["a terminal alkene, the OH on its end", "[CH2:1]=CCc1ccccc1", [{ do: "hydroborate", at: "1" }], "OCCCc1ccccc1"],
  ["a ring alkene to one alcohol", "C[C@@H]1C[CH:3]=[CH:4]CC1", [{ do: "hydroborate", at: "3", config: "S" }], "C[C@@H]1C[C@@H:3](O)CCC1"],
  ["the same to the other alcohol", "C[C@@H]1C[CH:3]=[CH:4]CC1", [{ do: "hydroborate", at: "3", config: "R" }], "C[C@@H]1C[C@H:3](O)CCC1"],
  ["a trisubstituted alkene, with another group", "CC(C)=[CH:1]C", [{ do: "hydroborate", at: "1", with: "Br" }], "CC(C)C(Br)C"],
  // open_epoxide.
  ["an epoxide opened to its alcohol", "C[C@H]1O[C@@H:3]1CC", [{ do: "open_epoxide", at: "3" }], "C[C@@H](O)CCC"],
  ["an epoxide opened with azide", "C[C@H]1O[C@@H:3]1CC", [{ do: "open_epoxide", at: "3", with: "N3", config: "R" }], "C[C@@H](O)[C@H:3](N=[N+]=[N-])CC"],
  ["cyclohexene oxide opened with methoxide", "C1CC[CH:1]2OC2C1", [{ do: "open_epoxide", at: "1", with: "OMe" }], "COC1CCCCC1O"],
  // lactonise.
  ["a hydroxy acid to its lactone", "O[C:1](=O)CCC[C@H:5](C)O", [{ do: "lactonise", at: "1-5" }], "O=C1CCC[C@H](C)O1"],
  ["a hydroxy ester to its lactone", "CO[C:1](=O)CC[CH2:4]O", [{ do: "lactonise", at: "1-4" }], "O=C1CCCO1"],
  ["a phthalide", "O[C:1](=O)c1ccccc1[CH2:2]O", [{ do: "lactonise", at: "1-2" }], "O=C1OCc2ccccc12"],
  // close and open.
  ["a ring closed in a chain", "C[CH2:1]CCC[CH2:6]C", [{ do: "close", at: "1-6" }], "CC1CCCC1C"],
  ["a ring closed with a double bond", "[CH3:1]CCCC[CH3:2]", [{ do: "close", at: "1-2", to: "double" }], "C1=CCCCC1"],
  ["a cyclic ether", "[OH:1]CCC[CH2:2]Br", [{ at: "2", remove: true }, { do: "close", at: "1-2" }], "C1CCOC1"],
  ["a ring opened at its alkene, to a dialdehyde", "C1CC[CH:1]=[CH:2]C1", [{ do: "open", at: "1-2" }, { at: "1", add: "=O" }, { at: "2", add: "=O" }], "O=CCCCCC=O"],
  ["a ring opened at a single bond", "C1CC[CH2:1][CH2:2]C1", [{ do: "open", at: "1-2" }], "CCCCCC"],
  // join, and config on a change that is no transformation.
  ["an aryl group joined to an aldehyde's carbon", "CC[CH:1]=O", [{ at: "1", set: "OH" }, { do: "join", at: "1-8", with: "9", config: { 1: "S" } }], "CC[C@H:1](O)c1ccccc1", { other: "[cH:8]1ccccc1" }],
  ["the other alcohol", "CC[CH:1]=O", [{ at: "1", set: "OH" }, { do: "join", at: "1-8", with: "9", config: { 1: "R" } }], "CC[C@@H:1](O)c1ccccc1", { other: "[cH:8]1ccccc1" }],
  ["a TBS taken off by its label", "CC(C)(C)[Si](C)(C)OCC[CH2:3]O", [{ do: "deprotect", with: "TBS", at: "OTBS" }], "OCCCO"],
  ["a TBS label taken off by its label", "C[C@H](*)CC", [{ do: "deprotect", with: "TBS", at: "OTBS" }], "C[C@H](O)CC", { labels: ["OTBS"] }],
  ["an alkene made E from two compounds", "CC[CH:2]=O", [{ at: "2", remove: true }, { do: "join", at: "2-8", with: "9", to: "double", config: { "2-8": "E" } }], "CC/C=C/C(=O)OC", { other: "[CH3:8]C(=O)OC" }],
  ["the same alkene made Z", "CC[CH:2]=O", [{ at: "2", remove: true }, { do: "join", at: "2-8", with: "9", to: "double", config: { "2-8": "Z" } }], "CC/C=C\\C(=O)OC", { other: "[CH3:8]C(=O)OC" }],
  ["an amide from an acid and an amine", "CC[C:1](=O)O", [{ at: "1", swap: { OH: "H" } }, { do: "join", at: "1-8", with: "9" }], "CCC(=O)NCc1ccccc1", { other: "[NH2:8]Cc1ccccc1" }],
  ["a new centre set on add", "CC[CH2:3]C", [{ at: "3", add: "OH", config: "R" }], "CC[C@H:3](O)C"],
  ["a new double bond set Z", "CC[CH2:1][CH2:2]CC", [{ bond: "1-2", to: "double", config: { "1-2": "Z" } }], "CC/C=C\\CC"],
  ["a new double bond set E", "CC[CH2:1][CH2:2]CC", [{ bond: "1-2", to: "double", config: { "1-2": "E" } }], "CC/C=C/CC"],
];
// More substrates for each transformation, so each has 20 or more (C5). Their products are written from the
// substrates as SMILES text, which does not depend on compound.ts: a group's SMILES put before a substrate written
// from its O-H or N-H, the same taken off, a C=C written as an epoxide or a diol, a diol's carbonate with CC1(C) for
// O=C1 as its acetonide, and so on.
{
  const rows = (d: string, extra: object, pairs: string[][]): Made[] => pairs.map(([from, want, at]) => [`${d} ${from}`, from, [{ do: d, ...extra, ...(at ? { at } : {}) }], want]);
  // Alcohols, amines and a thiol written from the atom that carries the H, each with one O-H, N-H or S-H.
  const OH = ["OCCCCC", "OC1CCCC1", "Oc1ccccc1", "OC[C@@H](C)CC", "OCC#N", "OCCCl", "OC(C)(C)CC", "O[C@@H](C)c1ccccc1", "OCCOC", "OCc1ccncc1", "OC1CCOCC1", "OCC1CC1", "OCC=C", "Oc1ccc(C)cc1", "OC[C@H]1CCCO1", "OCCCC(C)=O", "OCCSC", "OCC(F)(F)F", "OCCc1ccc(Br)cc1"];
  const NH = ["N1CCCCC1", "N(C)CC", "Nc1ccc(Cl)cc1", "NCc1ccco1", "N1CCOCC1", "NCCC", "N[C@@H](C)c1ccccc1"];
  // Each group as the start of a SMILES that goes on before the O or N.
  const PG: Record<string, string> = { TBS: "CC(C)(C)[Si](C)(C)", TBDPS: "CC(C)(C)[Si](c1ccccc1)(c1ccccc1)", TES: "CC[Si](CC)(CC)", TMS: "C[Si](C)(C)", TIPS: "CC(C)[Si](C(C)C)(C(C)C)", Bn: "c1ccccc1C", PMB: "COc1ccc(cc1)C", MOM: "COC", Ac: "CC(=O)", Bz: "O=C(c1ccccc1)", Boc: "CC(C)(C)OC(=O)", Cbz: "O=C(OCc1ccccc1)", Fmoc: "O=C(OCC1c2ccccc2-c2ccccc21)" };
  const on = (g: string) => (["Ac", "Bz", "Boc", "Cbz", "Fmoc"].includes(g) ? [OH[0], OH[7], NH[0], NH[6]] : [OH[1], OH[3]]);
  // Diols, with their carbonates: an acetonide is the same ring with CC1(C) for O=C1.
  const DIOLS = [
    ["O[CH2:1][CH2:2]O", "O=C1OCCO1", "1-2"], ["O[CH2:1][CH:2](O)C", "O=C1OCC(C)O1", "1-2"], ["O[CH2:1]C[CH2:3]O", "O=C1OCCCO1", "1-3"],
    ["O[CH2:1]C(C)(C)[CH2:3]O", "O=C1OCC(C)(C)CO1", "1-3"], ["O[CH:1]1CCCC[CH:2]1O", "O=C1OC2CCCCC2O1", "1-2"], ["O[CH:1]1CCC[CH:2]1O", "O=C1OC2CCCC2O1", "1-2"],
    ["O[CH2:1][C:2](O)(C)C", "O=C1OCC(C)(C)O1", "1-2"], ["O[CH2:1][CH:2](O)c1ccccc1", "O=C1OCC(c2ccccc2)O1", "1-2"], ["O[CH2:1][CH:2](O)COC", "O=C1OCC(COC)O1", "1-2"],
    ["O[CH2:1][CH:2](O)CCCC", "O=C1OCC(CCCC)O1", "1-2"], ["O[CH2:1][C@@H:2](O)c1ccccc1", "O=C1OC[C@@H](O1)c1ccccc1", "1-2"], ["O[CH2:1][C@H:2](O)CCC=C", "O=C1OC[C@H](O1)CCC=C", "1-2"],
    ["O[CH2:1][C@@H:2](O)C1CC1", "O=C1OC[C@@H](O1)C1CC1", "1-2"], ["O[CH2:1][C@H:2](O)CCOC", "O=C1OC[C@H](O1)CCOC", "1-2"], ["O[CH2:1][C@@H:2](O)CC(C)C", "O=C1OC[C@@H](O1)CC(C)C", "1-2"],
    ["O[CH2:1][C@H:2](O)CCc1ccccc1", "O=C1OC[C@H](O1)CCc1ccccc1", "1-2"], ["O[CH2:1][CH:2](C)[CH2:3]O", "O=C1OCC(C)CO1", "1-3"], ["O[CH2:1]c1ccccc1[CH2:2]O", "O=C1OCc2ccccc2CO1", "1-2"],
    ["O[c:1]1cccc[c:2]1O", "O=C1Oc2ccccc2O1", "1-2"], ["O[CH2:1][CH2:2]O", "O=C1OCCO1", "2-1"],
  ];
  const acetonide = (s: string) => s.replace(/^O=C1/, "CC1(C)");
  // Acids and their esters, written from the acid's O-H; aldehydes and ketones from their =O.
  const ACIDS = ["OC(=O)CCC", "OC(=O)c1ccccc1", "OC(=O)C1CCCCC1", "OC(=O)[C@@H](C)CC", "OC(=O)CC=C", "OC(=O)Cc1ccccc1", "OC(=O)CCCCl", "OC(=O)C(C)(C)C", "OC(=O)c1ccncc1", "OC(=O)CCOC", "OC(=O)C1CC1", "OC(=O)CC#C", "OC(=O)[C@H](C)c1ccccc1", "OC(=O)CCc1ccc(F)cc1", "OC(=O)CCCCCC", "OC(=O)c1ccco1"];
  const CARBONYLS = ["O=CCCC", "O=C(C)CCc1ccccc1", "O=C1CCCCC1", "O=Cc1ccccc1", "O=C(C)C", "O=C1CCC[C@H]1C", "O=CC[C@@H](C)CC", "O=C(c1ccccc1)c1ccccc1", "O=C1CCOCC1", "O=CCOC", "O=C(C)C1CC1", "O=C1CCCC1"];
  // Alkenes with one C=C written so (no other = or #), and one alkyne.
  const ALKENES = ["CCC=CCC", "C1CC=CCC1", "C=C(C)C", "C=CCCCC", "C1CCC=C1", "CC=C(C)C", "C=CC1CCCCC1", "OCCC=C", "C1CC=CC1", "CC(C)C=CC", "C=CCc1ccccc1", "C[C@@H](O)CC=C", "C=CCOC", "C1CCCC=CC1", "C=C(C)CCCl", "ClCCCC=C"];
  const DIOX = ALKENES.filter((s) => !s.includes("O") && !/C=C\d/.test(s));
  MADE.push(
    ...Object.entries(PG).flatMap(([g, pre]) => on(g).map((s): Made => [`${g} on ${s}`, s, [{ do: "protect", with: g }], pre + s])),
    ...Object.entries(PG).flatMap(([g, pre]) => on(g).map((s): Made => [`${g} off ${s}`, pre + s, [{ do: "deprotect", with: g }], s])),
    ...DIOLS.slice(0, 10).map(([s, c, at]): Made => [`an acetonide on ${s}`, s, [{ do: "protect", with: "acetonide", at }], acetonide(c)]),
    ...DIOLS.slice(10, 16).map(([s, c, at]): Made => [`a carbonate on ${s}`, s, [{ do: "protect", with: "carbonate", at }], c]),
    ...DIOLS.slice(0, 8).map(([s, c]): Made => [`an acetonide off ${s}`, acetonide(c), [{ do: "deprotect", with: "acetonide" }], s]),
    ...DIOLS.slice(8, 16).map(([s, c]): Made => [`a carbonate off ${s}`, c, [{ do: "deprotect", with: "carbonate" }], s]),
    ...rows("acetylate", {}, [...OH, ...NH].slice(0, 20).map((s) => [s, "CC(=O)" + s])),
    ...rows("benzoylate", {}, [...OH, ...NH].slice(2, 22).map((s) => [s, "O=C(c1ccccc1)" + s])),
    ...rows("form_carbonate", {}, DIOLS.map(([s, c, at]) => [s, c, at])),
    ...rows("esterify", { with: "Me" }, ACIDS.slice(0, 8).map((s) => [s, "C" + s])),
    ...rows("esterify", { with: "Et" }, ACIDS.slice(8, 16).map((s) => [s, "CC" + s])),
    ...rows("hydrolyse", {}, [...OH.filter((s) => s.length > 6).slice(0, 8).map((s) => ["CC(=O)" + s, s]), ...ACIDS.slice(0, 8).map((s) => ["C" + s, s]), ...DIOLS.slice(0, 4).map(([s, c]) => [c, s])]),
    // Acetals and ketals: the carbonyl compound stays, or the alcohol (a THP ether, by its atom or as the larger part).
    ...rows("hydrolyse", {}, [["C1CCC2(CC1)OCCO2", "O=C1CCCCC1"], ["COC(OC)CCc1ccccc1", "O=CCCc1ccccc1"], ["C1CCO[CH:1](C1)O[CH2:2]CCC", "OCCCC", "2"], ["CCOC(OCC)c1ccccc1", "O=Cc1ccccc1"], ["CC(C)(OC)OC", "CC(C)=O"], ["C1COC2(O1)CCCC2", "O=C1CCCC1"], ["CCC1(CC)OCCO1", "CCC(=O)CC"], ["c1ccc(cc1)C1OCCO1", "O=Cc1ccccc1"], ["c1ccc(cc1)C1OCCCO1", "O=Cc1ccccc1"], ["COC(OC)C1CCCCC1", "O=CC1CCCCC1"], ["CCCCC(OC)OC", "CCCCC=O"], ["C1CCC2(CC1)OCCCO2", "O=C1CCCCC1"], ["CC1(CCCCl)OCCO1", "CC(=O)CCCCl"], ["C1CCO[CH:1](C1)O[CH2:2]c1ccccc1", "OCc1ccccc1", "2"], ["C1CCOC(C1)OCCCCCCCC", "OCCCCCCCC"], ["COC1CCCCO1", "O=CCCCCO"], ["COC1CCCO1", "O=CCCCO"], ["CC(OC)OC", "CC=O"], ["COC(OC)c1ccncc1", "O=Cc1ccncc1"], ["CC1COC2(CCCCC2)O1", "O=C1CCCCC1"], ["COC(OC)CC#N", "O=CCC#N"], ["C1CCO[CH:1](C1)OCCCC", "O=CCCCCO", "1"]]),
    ...rows("oxidise", {}, [["OCCCCC", "O=CCCCC"], ["OC1CCCC1", "O=C1CCCC1"], ["OC[C@@H](C)CC", "O=C[C@@H](C)CC"], ["OCC#N", "O=CC#N"], ["OCCCl", "O=CCCl"], ["O[C@@H](C)c1ccccc1", "O=C(C)c1ccccc1"], ["OCCOC", "O=CCOC"], ["OCc1ccncc1", "O=Cc1ccncc1"], ["OC1CCOCC1", "O=C1CCOCC1"], ["OCC1CC1", "O=CC1CC1"], ["OCC=C", "O=CC=C"], ["OCC(F)(F)F", "O=CC(F)(F)F"], ["O=CCCC", "OC(=O)CCC"], ["O=Cc1ccccc1", "OC(=O)c1ccccc1"], ["O=CC[C@@H](C)CC", "OC(=O)C[C@@H](C)CC"]]),
    ...rows("reduce", {}, [...CARBONYLS.map((s) => [s, s.replace(/^O=C/, "OC")]), ...ACIDS.slice(0, 6).map((s) => [s, s.replace(/^OC\(=O\)/, "OC")]), ...ACIDS.slice(6, 12).map((s) => ["C" + s, s.replace(/^OC\(=O\)/, "OC")])]),
    ...rows("hydrogenate", {}, [...ALKENES.map((s) => [s, s.replace("=", "")]), ["CC#CC", "CCCC"], ["C#CCO", "CCCO"], ["C#Cc1ccccc1", "CCc1ccccc1"]]),
    ...rows("epoxidise", {}, ALKENES.map((s) => [s, s.replace("C=C", "C9OC9")])),
    ...rows("dihydroxylate", {}, DIOX.map((s) => [s, s.replace("C=C", "C(O)C(O)")])),
  );
  const join = (pairs: string[][]): Made[] => pairs.map(([from, other, want, to, config]) => [`join ${from} to ${other}`, from, [{ do: "join", at: "1-8", with: "9", ...(to ? { to } : {}), ...(config ? { config: JSON.parse(config) } : {}) }], want, { other }]);
  // A chiral compound joined: each of its centres keeps its configuration, whichever way round it is put. The product
  // is the two SMILES as text, with a ring-closure digit for the new bond on atoms 1 and 8.
  const glue = (a: string, b: string) => `${a.replace(/(\[[^\]]*:1\])/, "$1%99")}.${b.replace(/(\[[^\]]*:8\])/, "$1%99")}`;
  const CHIRAL = ["[CH3:8][C@H](N)c1ccccc1", "[CH3:8][C@@H](O)CC", "[CH3:8][C@H](F)C(=O)OC", "[CH3:8][C@@]1(O)CCCC[C@H]1C", "[CH3:8][C@H](Cl)c1ccccc1", "[CH3:8]C[C@@H](C)O"];
  MADE.push(...join(["O[CH2:1]C[C@H](C)CC", "[CH3:1]c1ccccc1", "CC[CH:1]=O", "[CH3:1]C(C)(C)C"].flatMap((f) => CHIRAL.map((o) => [f, o, glue(f, o)]))));
  MADE.push(
    ...rows("dihydroxylate", {}, [["C=Cc1ccccc1", "OCC(O)c1ccccc1"], ["C=CC#N", "OCC(O)C#N"], ["C=CCCl", "OCC(O)CCl"], ["CC(C)=C(C)C", "CC(C)(O)C(C)(O)C"], ["C=CC(=O)OC", "OCC(O)C(=O)OC"], ["C=CCOC", "OCC(O)COC"]]),
    ...rows("hydroborate", {}, [["[CH2:1]=CCCCC", "OCCCCCC", "1"], ["[CH2:1]=C(C)C", "OCC(C)C", "1"], ["C1CC[CH:1]=CC1", "OC1CCCCC1", "1"], ["[CH2:1]=Cc1ccccc1", "OCCc1ccccc1", "1"], ["CC(C)=[CH:1]C", "CC(C)C(O)C", "1"], ["C[C:1](C)=CC", "CC(C)(O)CC", "1"], ["[CH2:1]=CC1CCCCC1", "OCCC1CCCCC1", "1"], ["[CH2:1]=CCOC", "OCCCOC", "1"], ["C1C[CH:1]=CC1", "OC1CCCC1", "1"], ["[CH2:1]=CCCCl", "OCCCCCl", "1"], ["[CH2:1]=C(C)CCC", "OCC(C)CCC", "1"], ["CC[CH:1]=CCC", "CCC(O)CCC", "1"], ["[CH2:1]=CC[C@@H](C)O", "OCCC[C@@H](C)O", "1"], ["[CH2:1]=CCc1ccc(OC)cc1", "OCCCc1ccc(OC)cc1", "1"]]),
    ["hydroborate with another group", "[CH2:1]=CCCC", [{ do: "hydroborate", at: "1", with: "Br" }], "BrCCCCC"],
    ["hydroborate of a methylcyclohexene, both centres set", "C[C:2]1=[CH:1]CCCC1", [{ do: "hydroborate", at: "1", config: { 1: "R", 2: "R" } }], "C[C@@H:2]1CCCC[C@H:1]1O"],
    ...rows("open_epoxide", {}, [["[CH2:1]1OC1CC", "CC(O)CC", "1"], ["CC1O[CH:1]1C", "CCC(O)C", "1"], ["C1CCC2O[CH:1]2C1", "OC1CCCCC1", "1"], ["[CH2:1]1OC1c1ccccc1", "CC(O)c1ccccc1", "1"], ["C[C:1]1(C)OC1", "CC(C)CO", "1"], ["[CH2:1]1OC1(C)C", "CC(C)(C)O", "1"], ["[CH2:1]1OC1C1CCCCC1", "CC(O)C1CCCCC1", "1"], ["[CH2:1]1O[C@@H]1CC", "O[C@@H](C)CC", "1"]]),
    ...([["[CH2:1]1OC1CC", "OMe", "COCC(O)CC"], ["C1CC[CH:1]2OC2C1", "N3", "[N-]=[N+]=NC1CCCCC1O"], ["[CH2:1]1OC1c1ccccc1", "CN", "N#CCC(O)c1ccccc1"], ["[CH2:1]1OC1CCCl", "Br", "BrCC(O)CCCl"], ["[CH2:1]1OC1COC", "OH", "OCC(O)COC"], ["[CH2:1]1OC1CC=C", "SMe", "CSCC(O)CC=C"], ["C1C[CH:1]2OC2C1", "OMe", "COC1CCCC1O"], ["[CH2:1]1OC1CC(C)C", "Ph", "c1ccccc1CC(O)CC(C)C"], ["[CH2:1]1OC1CCc1ccccc1", "NHBn", "c1ccccc1CNCC(O)CCc1ccccc1"]].map(([from, w, want]): Made => [`open_epoxide ${from} with ${w}`, from, [{ do: "open_epoxide", at: "1", with: w }], want])),
    ...rows("lactonise", {}, [["O[C:1](=O)CC[CH:4](C)O", "O=C1CCC(C)O1", "1-4"], ["CO[C:1](=O)CCC[CH2:5]O", "O=C1CCCCO1", "1-5"], ["O[C:1](=O)CCCC[CH2:6]O", "O=C1CCCCCO1", "1-6"], ["O[C:1](=O)c1ccccc1C[CH2:3]O", "O=C1OCCc2ccccc12", "1-3"], ["O[C:1](=O)C(C)(C)C[CH2:4]O", "O=C1OCCC1(C)C", "1-4"], ["O[C:1](=O)CC[C:4](C)(C)O", "O=C1CCC(C)(C)O1", "1-4"], ["O[C:1](=O)CC[C@H:4](C)O", "O=C1CC[C@H](C)O1", "1-4"], ["O[C:1](=O)CCC[C@@H:5](CC)O", "O=C1CCC[C@@H](CC)O1", "1-5"], ["CCO[C:1](=O)CC[CH2:4]O", "O=C1CCCO1", "1-4"], ["O[C:1](=O)C[CH2:3]O", "O=C1CCO1", "1-3"], ["O[C:1](=O)CC[CH:4](O)c1ccccc1", "O=C1CCC(c2ccccc2)O1", "1-4"], ["O[C:1](=O)CCC(C)(C)[CH2:6]O", "O=C1CCC(C)(C)CO1", "1-6"], ["O[C:1](=O)Cc1ccccc1[CH2:3]O", "O=C1Cc2ccccc2CO1", "1-3"], ["O[C:1](=O)CCOC[CH2:6]O", "O=C1CCOCCO1", "1-6"], ["O[C:1](=O)CCCCCCCCC[CH2:11]O", "O=C1CCCCCCCCCCO1", "1-11"], ["O[C:1](=O)CCC[CH2:5]O", "O=C1CCCCO1", "5-1"], ["O[C:1](=O)CC[CH2:4][OH:9]", "O=C1CCCO1", "1-9"]]),
    ...rows("close", {}, [["[CH3:1]CCC[CH3:2]", "C1CCCC1", "1-2"], ["[CH3:1]C[CH3:2]", "C1CC1", "1-2"], ["[CH3:1]CC[CH3:2]", "C1CCC1", "1-2"], ["[CH3:1]CCCCC[CH3:2]", "C1CCCCCC1", "1-2"], ["[NH2:1]CCCC[CH3:2]", "N1CCCCC1", "1-2"], ["[OH:1]CCC[CH3:2]", "C1CCOC1", "1-2"], ["c1ccccc1C[CH2:1]C[CH3:2]", "c1ccccc1CC1CC1", "1-2"], ["[CH3:1]c1ccccc1[CH3:2]", "C1c2ccccc2C1", "1-2"], ["[CH3:1]Cc1ccccc1[CH3:2]", "C1Cc2ccccc2C1", "1-2"], ["[CH2:1]=CCC[CH3:2]", "C1=CCCC1", "1-2"], ["[CH3:1]CC(C)(C)C[CH3:2]", "C1CC(C)(C)CC1", "1-2"], ["C[CH2:1]C(=O)C[CH3:2]", "CC1C(=O)CC1", "1-2"], ["[CH3:1]CCCC(C)(C)[CH3:2]", "C1CCCC(C)(C)C1", "1-2"], ["[SH:1]CCC[CH3:2]", "C1CCSC1", "1-2"], ["O=C([CH3:1])CC[CH3:2]", "O=C1CCCC1", "1-2"], ["[NH2:1]CCC[CH3:2]", "C1CCNC1", "1-2"]]),
    ["close with a double bond", "[CH3:1]CCC[CH3:2]", [{ do: "close", at: "1-2", to: "double" }], "C1=CCCC1"],
    ...rows("open", {}, [["C1CCC[CH2:1][CH2:2]1", "CCCCCC", "1-2"], ["C1C[CH2:1][CH2:2]1", "CCCC", "1-2"], ["C1[CH2:1][CH2:2]1", "CCC", "1-2"], ["C1C[CH2:1][CH2:2]C1", "CCCCC", "1-2"], ["C1CC[O:1][CH2:2]C1", "OCCCCC", "1-2"], ["C1C[O:1][CH2:2]C1", "OCCCC", "1-2"], ["C1CC[NH:1][CH2:2]C1", "NCCCCC", "1-2"], ["O=C1CCC[CH2:1][O:2]1", "OC(=O)CCCC", "1-2"], ["c1ccc2c(c1)[CH2:1][CH2:2]C2", "Cc1ccccc1CC", "1-2"], ["C1CCC2CCCC[CH:1]2[CH2:2]1", "CCCCC1CCCCC1", "1-2"], ["C1CCCC[CH2:1][CH2:2]1", "CCCCCCC", "1-2"], ["O=C1CC[CH2:1][CH2:2]C1", "CCC(=O)CCC", "1-2"], ["CC1CC[CH2:1][CH2:2]1", "CC(C)CCC", "1-2"], ["C1CC[CH2:1][N:2]1C", "CNCCCC", "1-2"], ["c1ccc2c(c1)C[CH2:1][CH2:2]C2", "CCc1ccccc1CC", "1-2"], ["C1CCC[CH2:1][S:2]1", "SCCCCC", "1-2"], ["C1[O:1][CH:2]1C", "OCCC", "1-2"], ["C1CCCCC[CH2:1][CH2:2]1", "CCCCCCCC", "1-2"]]),
    ...join([["[CH3:1]C", "[cH:8]1ccccc1", "CCc1ccccc1"], ["[cH:1]1ccccc1", "[cH:8]1ccccc1", "c1ccc(cc1)-c1ccccc1"], ["[cH:1]1ccncc1", "[cH:8]1ccccc1", "c1ccc(cc1)-c1ccncc1"], ["[NH2:1]CC", "[CH3:8]C(=O)C", "CCNCC(=O)C"], ["[OH:1]C", "[CH3:8]CC", "COCCC"], ["CC[CH2:1]O", "[CH3:8]c1ccccc1", "CCC(O)Cc1ccccc1"], ["[CH3:1]C(=O)OC", "[CH3:8]C(=O)OC", "COC(=O)CCC(=O)OC"], ["c1ccc2c(c1)cc[nH:1]2", "[CH4:8]", "Cn1ccc2ccccc21"], ["[SH:1]C", "[CH3:8]c1ccccc1", "CSCc1ccccc1"], ["[CH3:1]C#N", "[CH3:8]Cl", "ClCCC#N"], ["C1CC[NH:1]CC1", "[cH:8]1ccccc1", "c1ccc(cc1)N1CCCCC1"], ["[CH3:1]c1ccccc1", "[CH3:8]c1ccccc1", "c1ccc(cc1)CCc1ccccc1"], ["[CH3:1]C", "[CH3:8]C", "C/C=C/C", "double", '{"1-8":"E"}'], ["[CH3:1]CC", "[CH3:8]C", "CC/C=C\\C", "double", '{"1-8":"Z"}'], ["C[CH2:1]O", "[cH:8]1ccccc1", "C[C@H:1](O)c1ccccc1", "", '{"1":"S"}']]),
  );
}
{
  const { TRANSFORMATIONS } = await import("./compound.ts");
  const names = new Map<string, number>();
  for (const [what, from, changes, want, more] of MADE) {
    d = drawing();
    const r = await call("draw", { kind: "structures", structures: [{ text: from, ...(more?.labels ? { labels: more.labels } : {}), number: "1" }, ...(more?.other ? [{ text: more.other, number: "9" }] : []), { from: "1", changes, number: "2" }] });
    assert.ok(!r.isError, `${what}: ${said(r)}`);
    const got = (await reading()).structures.find((s: { number: string }) => s.number === "2"), expected = tagged(parseStructure(want)), labels = stereoLabels(expected);
    assert.equal(got.inchiKey, toInchiKey(expected), `${what}: drew ${got.smiles}, not ${want}`);
    assert.equal(cip(numbered("2")), cip(expected), `${what}: the CIP labels of ${want}`);
    for (const c of changes) {
      if (c.do) names.set(c.do, (names.get(c.do) ?? 0) + 1);
      // The label config asks for is the label of that atom in the product as it is written here.
      for (const [name, label] of Object.entries(typeof c.config === "string" ? { [(c as { at: string }).at]: c.config } : (c.config ?? {}))) if (!name.includes("-")) assert.equal(labels?.atoms[expected.atoms.findIndex((a) => a.tag === Number(name))], label, `${what}: atom ${name} of ${want}`);
    }
    // A centre with no label asked for has none, and the reply says how to give one.
    if (what === "a ketone to its alcohol, with no configuration") assert.equal(cip(numbered("2")), "");
  }
  // Every transformation is in the table, and in the list an AI app can ask for.
  const listed = /They are: ([a-z_, ]+)\.$/.exec(change(parseStructure("CCO"), [{ do: "nothing" }]) as string)![1].split(", ");
  assert.deepEqual([...names.keys()].sort(), [...listed].sort());
  for (const [name, count] of names) assert.ok(count >= 20, `${name} is made on ${count} substrates, not 20 or more`);
  for (const name of listed) assert.ok(new RegExp(`(^|[ ,])${name}[:,]`, "m").test(TRANSFORMATIONS), `${name} is in TRANSFORMATIONS`);
  // Where draw lists a compound's changes, do and config are named in one example.
  const tools = JSON.parse(await handle(JSON.stringify({ jsonrpc: "2.0", id: ++n, method: "tools/list" }), () => d.host, "1", { client: "Check" })).result.tools as { name: string; inputSchema: any }[];
  assert.match(tools.find((t) => t.name === "draw")!.inputSchema.$defs.compound.properties.changes.description, /\{do: 'reduce', at: '7', config: 'R'\}, a named transformation/);
}

// Refused, with the places Octet found (C5): a transformation that fits two places, or none, and one that is not
// said in full. Nothing is guessed, and nothing is drawn.
{
  const refuse = async (text: string, changes: unknown, why: RegExp, other?: string) => {
    d = drawing();
    const r = await call("draw", { kind: "structures", structures: [{ text, number: "1" }, ...(other ? [{ text: other, number: "9" }] : []), { from: "1", changes, number: "2" }] });
    assert.ok(r.isError, `${JSON.stringify(changes)} is refused`);
    assert.match(said(r), why);
    assert.equal(d.host.doc().atoms.length, 0, "a refused call draws nothing");
  };
  // Two places: both are named, by the numbers the AI app gave.
  await refuse("C[C@H:2](O)CC[CH2:5]O", [{ do: "protect", with: "TBS" }], /protect fits 2 places \(O-H on atom 2; O-H on atom 5\): say which with at, an atom's number\./);
  await refuse("CC(C)(C)[Si](C)(C)O[CH2:1]C[CH2:3]O[Si](C)(C)C(C)(C)C", [{ do: "deprotect", with: "TBS" }], /deprotect fits 2 places \(TBS on the O of atom 1; TBS on the O of atom 3\)/);
  await refuse("O[CH2:1]CC[C@H:4](O)C", [{ do: "oxidise" }], /oxidise fits 2 places \(the O-H on atom 1; the O-H on atom 4\)/);
  await refuse("C[C:2](=O)CC[C:5](=O)OC", [{ do: "reduce" }], /reduce fits 2 places \(the C=O at atom 2; the ester at atom 5\)/);
  await refuse("[CH2:1]=[CH:2][CH:3]=[CH:4]C", [{ do: "hydrogenate" }], /hydrogenate fits 2 places \(the C=C of atom 1 and atom 2; the C=C of atom 3 and atom 4\)/);
  await refuse("[CH2:1]=[CH:2]C[CH:4]=[CH2:5]", [{ do: "epoxidise" }], /epoxidise fits 2 places \(the C=C of atom 1 and atom 2; the C=C of atom 4 and atom 5\)/);
  await refuse("[CH2:1]=[CH:2]C[CH:4]=[CH2:5]", [{ do: "dihydroxylate" }], /dihydroxylate fits 2 places/);
  await refuse("CO[C:1](=O)CC[C:4](=O)OCC", [{ do: "hydrolyse" }], /hydrolyse fits 2 places \(the ester at atom 1; the ester at atom 4\)/);
  await refuse("O[C:1](=O)CC[C:4](=O)O", [{ do: "esterify", with: "Me" }], /esterify fits 2 places \(O-H on atom 1; O-H on atom 4\)/);
  await refuse("O[CH2:1]CC[CH2:4]O", [{ do: "benzoylate" }], /benzoylate fits 2 places \(O-H on atom 1; O-H on atom 4\)/);
  await refuse("CC1(C)O[CH2:1][CH:2](O1)CC[CH:5]2[CH2:6]OC(C)(C)O2", [{ do: "deprotect", with: "acetonide" }], /deprotect fits 2 places \(the acetonide on atom [12] and atom [12]; the acetonide on atom [56] and atom [56]\)/);
  // With no numbers to name the places by, the reply says how to give them.
  await refuse("OCCCO", [{ do: "acetylate" }], /acetylate fits 2 places .* \(number an atom in the compound's SMILES to name it, as \[CH2:7\]\)/);
  // An ester's two parts of one size: Octet does not choose the one that stays.
  await refuse("CCOC(C)=O", [{ do: "hydrolyse" }], /the two parts of the ester at atom #3 are of one size: name an atom of the part that stays with at/);
  await refuse("CCOC(C)OCC", [{ do: "hydrolyse" }], /the parts of the acetal at atom #3 are of one size: name an atom of the part that stays with at/);
  // No place.
  await refuse("CC(C)(C)O", [{ do: "oxidise" }], /oxidise fits no place in this compound\. This compound has no atom numbers/);
  await refuse("CCCO", [{ do: "deprotect", with: "Bn" }], /deprotect fits no place in this compound/);
  await refuse("c1ccccc1", [{ do: "hydrogenate" }], /hydrogenate fits no place in this compound/);
  await refuse("C[CH2:1]C=C", [{ do: "epoxidise", at: "1" }], /epoxidise fits no place at atom 1\. This compound has the atom numbers 1/);
  await refuse("CCCC", [{ do: "reduce" }], /reduce fits no place in this compound/);
  await refuse("CCO", [{ do: "dihydroxylate" }], /dihydroxylate fits no place in this compound/);
  await refuse("CCOC", [{ do: "acetylate" }], /acetylate fits no place in this compound/);
  await refuse("[CH3:1]CC", [{ do: "hydroborate", at: "1" }], /hydroborate fits no place at atom 1/);
  await refuse("CCCC", [{ do: "hydrolyse" }], /hydrolyse fits no place in this compound/);
  await refuse("CC[CH2:1]OCC", [{ do: "open_epoxide", at: "1" }], /open_epoxide fits no place at atom 1/);
  await refuse("O[CH2:1][CH2:2]C", [{ do: "protect", with: "acetonide", at: "1-2" }], /atom 2 carries no O-H: acetonide takes at, the two atoms that carry a diol's hydroxyls/);
  // Not said in full, or with a key that does not go with it. A name that is no transformation gets the list.
  await refuse("CCO", [{ do: "methylate" }], /methylate is not a transformation\. They are: protect, deprotect, acetylate, benzoylate, form_carbonate, esterify, hydrolyse, oxidise, reduce, hydrogenate, epoxidise, dihydroxylate, hydroborate, open_epoxide, lactonise, close, open, join\./);
  await refuse("CCO", [{ do: "protect", with: "Tr" }], /protect takes with: TBS, TBDPS, TES, TMS, TIPS, Bn, PMB, MOM, Ac, Bz, Boc, Cbz, Fmoc, acetonide, carbonate/);
  await refuse("CCO", [{ do: "oxidise", to: "double" }], /to does not go with oxidise/);
  await refuse("CCO", [{ do: "oxidise", with: "PCC" }], /with does not go with oxidise/);
  await refuse("CCC(=O)O", [{ do: "esterify", with: "4-ClC6H4" }], /Octet cannot read O4-ClC6H4 as a group/);
  await refuse("C=CC", [{ do: "hydroborate" }], /hydroborate takes at: the carbon of the C=C that takes the OH/);
  await refuse("C[CH:1]1O[CH:2]1C", [{ do: "open_epoxide" }], /open_epoxide takes at: the carbon that loses the oxygen/);
  await refuse("OC(=O)CCCO", [{ do: "lactonise" }], /lactonise takes at: an acid's or ester's carbon and the atom that carries the O-H/);
  await refuse("C[CH2:1][CH2:2]C", [{ do: "close", at: "1-2" }], /atom 1 and atom 2 are bonded: bond changes a bond's order/);
  await refuse("C[CH2:1][CH2:2]C", [{ do: "open", at: "1-2" }], /the bond between atom 1 and atom 2 is not in a ring: a change cannot make two compounds of one/);
  // join: the other compound must be there, each atom in its own compound, each number once in the two.
  await refuse("CC[CH:1]=O", [{ do: "join", at: "1-8", with: "7" }], /with: there is no compound 7 earlier in this call or in the drawing\./);
  await refuse("C[CH2:1][CH2:2]C", [{ do: "join", at: "1-2", with: "9" }], /join takes at: an atom of this compound and an atom of the other/, "[cH:8]1ccccc1");
  await refuse("CC[CH3:8]", [{ do: "join", at: "8-8", with: "9" }], /the two compounds each have an atom numbered 8: give each atom its own number/, "[cH:8]1ccccc1");
  // config: a label that is none, and a label for an atom that is no stereocentre.
  await refuse("C[C:2](=O)CC", [{ do: "reduce", config: "Q" }], /config takes \{atom's number: 'R' or 'S'\} or \{bond: 'E' or 'Z'\}/);
  await refuse("C[C:2](=O)C", [{ do: "reduce", at: "2", config: "R" }], /config: Octet cannot draw atom 2 as R: it may not be a stereocentre in this compound/);
  await refuse("CC(C)(C)[Si](C)(C)O[CH2:1]C[CH2:3]O[Si](C)(C)C(C)(C)C", [{ do: "deprotect", with: "TBS", at: "OTBS" }], /there are 2 OTBS \(on atom 1, atom 3\): give at as the number of the atom the group is on/);
  // A centre the changes keep is not turned over by config.
  await refuse("C[C@H:2](O)C[CH2:4]C", [{ at: "4", add: "Br", config: { 2: "R" } }], /config: atom 2 keeps its configuration \(S\) through these changes, and config sets only a new centre/);
  // A new centre with no label asked for is drawn with none, and the reply says how to give one.
  d = drawing();
  const r = await call("draw", { kind: "structures", structures: [{ text: "C[C@H](O)C[C:2](=O)CC", number: "1" }, { from: "1", changes: [{ do: "reduce", at: "2" }], number: "2" }] });
  assert.match(said(r), /\(2\) \[Atom 2 is now a stereocentre with no configuration: to set one, give config \(\{'2': 'R'\}\)\.\]/);
  assert.equal((await reading()).structures[1].inchiKey, keyOf("C[C@H](O)CC(O)CC"));
}
// The layout (L5). An atom a transformation does not change stays where it is. A new small ring is regular. A ring
// closed between atoms far apart, and a new atom with no room, have the compound drawn again, and the reply says so.
{
  const at = (m: Mol) => new Set(m.atoms.map((a) => a.location.slice(0, 2).map((v) => v.toFixed(3)).join(" ")));
  const still = (from: Mol, to: Mol) => { const there = at(to); return [...at(from)].filter((p) => there.has(p)).length; };
  const steroid = tagged(parseStructure("C[C@]12CC[C@H]3[C@@H](CCC4=C[C:3](=O)CC[C@]34C)[C@@H]1CC[C@@H:17]2O"));
  for (const [changes, gone] of [[[{ do: "oxidise", at: "17" }], 0], [[{ do: "protect", with: "TBS" }], 0], [[{ do: "reduce", at: "3" }], 0], [[{ do: "hydrogenate" }], 0], [[{ do: "epoxidise" }], 0]] as const) {
    const out = change(steroid, [...changes]);
    assert.ok(typeof out !== "string", String(out));
    assert.equal(still(steroid, out.mol), steroid.atoms.length - gone, `${JSON.stringify(changes)} moves no atom`);
  }
  // An acetonide: the ring's carbons stay, and the five bonds of the new ring are one bond long.
  const diol = tagged(parseStructure("O[C@H:1]1CCCC[C@H:2]1O")), ketal = change(diol, [{ do: "protect", with: "acetonide", at: "1-2" }]);
  assert.ok(typeof ketal !== "string" && still(diol, ketal.mol) === 6 && !ketal.notes.some((t) => /drew the compound again/.test(t)), String(ketal));
  const long = (m: Mol, b: Mol["bonds"][number]) => Math.hypot(m.atoms[b.atoms[0]].location[0] - m.atoms[b.atoms[1]].location[0], m.atoms[b.atoms[0]].location[1] - m.atoms[b.atoms[1]].location[1]);
  assert.ok(ketal.mol.bonds.every((b) => Math.abs(long(ketal.mol, b) - 1) < 0.02), "each bond of the acetonide is one bond long");
  // A joined compound: the compound it is joined to does not move, and the new bond is one bond long.
  const aldehyde = tagged(parseStructure("C[C@H](Cc1ccccc1)C[CH:1]=O")), joined = change(aldehyde, [{ at: "1", set: "OH" }, { do: "join", at: "1-8", with: "9" }], () => tagged(parseStructure("[cH:8]1ccccc1")));
  assert.ok(typeof joined !== "string" && still(aldehyde, joined.mol) === aldehyde.atoms.length, String(joined));
  assert.ok(Math.abs(long(joined.mol, joined.mol.bonds[joined.mol.bonds.length - 1]) - 1) < 0.02);
  // A ring closed between the two ends of a chain: the new ring is drawn regular, and one end with its methyl stays
  // where it was. Only the ring moved, so the reply does not say the compound was drawn again.
  const open = tagged(parseStructure("C[CH2:1]CCC[CH2:6]C")), ring = change(open, [{ do: "close", at: "1-6" }]);
  assert.ok(typeof ring !== "string" && !ring.notes.length && ring.mol.bonds.every((b) => Math.abs(long(ring.mol, b) - 1) < 0.02) && still(open, ring.mol) === 2, typeof ring === "string" ? ring : ring.notes.join(" "));
  // An epoxide whose O would lie on an atom goes on the other side of its C=C, and nothing else moves.
  const crowd = tagged(parseStructure("C1CC[CH:1]=[CH:2]C1")), side = { ...crowd, atoms: [...crowd.atoms, { label: "Cl", location: [0, 0, 0] as [number, number, number] }] };
  const o = change(crowd, [{ do: "epoxidise" }]) as { mol: Mol }, oAt = o.mol.atoms[o.mol.atoms.length - 1].location;
  side.atoms[side.atoms.length - 1].location = [oAt[0], oAt[1], 0];
  const other = change(side, [{ do: "epoxidise" }]);
  assert.ok(typeof other !== "string" && !other.notes.length && still(side, other.mol) === side.atoms.length && Math.hypot(other.mol.atoms[other.mol.atoms.length - 1].location[0] - oAt[0], other.mol.atoms[other.mol.atoms.length - 1].location[1] - oAt[1]) > 1, typeof other === "string" ? other : other.notes.join(" "));
  // The same chain turned a quarter turn gives the same ring turned so.
  const chain = tagged(parseStructure("C[CH2:1]CCC[CH2:6]C")), quarter = change({ ...chain, atoms: chain.atoms.map((a) => ({ ...a, location: [-a.location[1], a.location[0], 0] as [number, number, number] })) }, [{ do: "close", at: "1-6" }]);
  assert.ok(typeof quarter !== "string" && quarter.mol.atoms.every((a, i) => Math.hypot(a.location[0] + ring.mol.atoms[i].location[1], a.location[1] - ring.mol.atoms[i].location[0]) < 0.01), "turned as the chain was");
}

// ---- Nicolaou's taxol route in the new form: every compound is the one the paper has ----

const bench = (f: string) => JSON.parse(readFileSync(new URL(`../scripts/mcp-bench/taxol/${f}.json`, import.meta.url), "utf8"));
const route = bench("route"), FULL: Record<string, string> = bench("structures");
{
  d = drawing();
  let chained = 0, all = 0, again = 0;
  for (const { start, steps } of route.schemes) {
    for (const c of [...start, ...steps.flatMap((s: { products: object[] }) => s.products)]) { all++; if ("from" in c) chained++; }
    const r = await call("draw", { kind: "reaction", start, steps });
    assert.ok(!r.isError, said(r));
    again += said(r).split("Octet drew the compound again").length - 1;
    // The acetonide of 6, drawn alone in the room there is, meets no label: scheme 1 is clean.
    if (start[0].number === "2") assert.equal(r.structuredContent.check, "clean");
  }
  assert.deepEqual([chained, all], [18, 21]);
  // Only the McMurry ring (13) has the whole compound drawn again: the part that stays has three atoms of the new ring
  // that are not one run. Each other new ring is drawn alone (ringed).
  assert.equal(again, 1);
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
  // (again: the compounds a named transformation laid out again, timed alone.)
  let fromSmiles = Infinity, fromChanges = Infinity, again = [Infinity, Infinity, 0];
  for (let round = 1; round <= 3; round++) {
    const grown = (m: Mol): Mol => ({ ...m, atoms: m.atoms.map((a) => ({ ...a, location: [a.location[0] * (1 + round / 500), a.location[1] * (1 + round / 500), 0] as [number, number, number] })) });
    let a = 0, b = 0, x = 0, y = 0, n = 0;
    for (const c of chained) {
      const source = grown(numbered(c.from)), t0 = performance.now(), out = change(source, c.changes, (name) => grown(numbered(name))), t1 = performance.now();
      assert.ok(typeof out !== "string" && toInchiKey(expandLabels(out.mol)) === keyOf(FULL[c.number]), `compound ${c.number}`);
      const t2 = performance.now();
      assert.ok(h.structure(FULL[c.number]));
      a += t1 - t0; b += performance.now() - t2;
      if (typeof out !== "string" && out.notes.some((t) => /drew the compound again/.test(t))) { x += t1 - t0; y += performance.now() - t2; n++; }
    }
    fromChanges = Math.min(fromChanges, a); fromSmiles = Math.min(fromSmiles, b);
    again = [Math.min(again[0], x), Math.min(again[1], y), n];
  }
  assert.ok(fromChanges <= fromSmiles, `from changes ${fromChanges.toFixed(1)} ms, from SMILES ${fromSmiles.toFixed(1)} ms`);
  if (process.argv.includes("--time")) console.log(`compound.check: the route's ${chained.length} compounds with changes: from the compound before ${fromChanges.toFixed(1)} ms, from SMILES ${fromSmiles.toFixed(1)} ms. The ${again[2]} of them that are drawn again: ${again[0].toFixed(1)} ms, from SMILES ${again[1].toFixed(1)} ms`);
}
// The same route with each step that the paper says in words written so (both OH, 2° OTBS, reduce lactone, 1° OAc), as
// an AI app writes it with no atom numbers: every compound is the paper's, so every stereocentre is kept. (Each
// group stays drawn as atoms where a later scheme names its atoms: reduce ester, 1° OH>OTBDPS, and 7 by its number.)
{
  d = drawing();
  const words: Record<string, object[]> = {
    3: [{ swap: { "both OH": "OTBS" } }, { do: "reduce", at: "ester" }], 4: [{ swap: { "2° OTBS": "OH" } }, { swap: { "1° OH": "OTBDPS" } }, { swap: { OH: "OBn" } }],
    5: [{ do: "reduce", at: "lactone" }, { swap: { OTBS: "OH" } }], 16: [{ swap: { "1° OH": "OAc" } }], 17: [{ swap: { OBn: "OTES" } }, { swap: { "1° OAc": "OH" } }],
  };
  for (const { start, steps } of route.schemes) {
    const r = await call("draw", { kind: "reaction", start, steps: steps.map((s: { products: { number: string }[] }) => ({ ...s, products: s.products.map((p) => (words[p.number] ? { ...p, changes: words[p.number] } : p)) })) });
    assert.ok(!r.isError, said(r));
  }
  const drawn = (await reading()).structures as { number?: string; inchiKey: string }[];
  for (const number of Object.keys(FULL).filter((k) => k !== "20")) {
    const as = drawn.filter((s) => s.number === number);
    assert.ok(as.length && as.every((s) => s.inchiKey === keyOf(FULL[number])), `taxol route in words: compound ${number}`);
  }
  // The five-step job (scripts/mcp-evals/speed.mjs, paper-five-step) by lines from 2's SMILES with no numbers. The
  // acetonide 6 is a SMILES: an acetonide is made at two atoms' numbers, and no number is there to give.
  d = drawing();
  const five = await call("draw", { lines: `${FULL[2]} (2)\n-> 2[both OH>OTBS; CO2Et>CH2OH] (3), a) TBSOTf\n-> 3[2° OTBS>OH; CH2OH>CH2OTBDPS; OH>OBn] (4), c) CSA\n-> 4[reduce lactone; OTBS>OH] (5), LiAlH4\n-> ${FULL[6]} (6), CSA\n-> 6[CH2OH>CHO] (7), TPAP` });
  assert.match(said(five), /^Drew a scheme of 5 steps\. Octet notes: from 2 \(3\) \[Changed both OH to OTBS\./);
  const got = (await reading()).structures as { number?: string; inchiKey: string }[];
  assert.deepEqual(got.map((s) => s.number), ["2", "3", "4", "5", "6", "7"]);
  for (const s of got) assert.equal(s.inchiKey, keyOf(FULL[s.number!]), `five-step job: compound ${s.number}`);
}

console.log("compound.check: ok");
