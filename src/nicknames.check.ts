// Run: node src/nicknames.check.ts. Octet's built-in nicknames (from ReShiki's catalogue, PR #146 by Prof. Dr. Stefan
// Schramm) and the user's own (Structure > Define Nickname…): each built-in spelling is no element and no label Octet
// reads as another group; the user's own read first, in the formula, SMILES and CDXML, and go when removed.
import assert from "node:assert/strict";
import { browser } from "../scripts/checkkit.ts";

browser();
const chem = await import("./chem.ts");
await chem.ready;
const { isElement, labelSmiles, nicknameProblem, standsIn } = await import("./labels.ts");
const { BUILT_IN, builtInNickname, readNicknames, setOwnNicknames, withNickname, withoutNickname, MOST_OWN_NICKNAMES } = await import("./nicknames.ts");
const { NICKNAME_DATA } = await import("./nicknamedata.ts");
const { fromCdxml, toCdxml } = await import("./cdxml.ts");
const { DEFAULT_STYLE } = await import("./docstyle.ts");
const { contractLabel, setLabel } = await import("./edit.ts");
type Mol = import("./render.ts").Mol;

const capped = (smiles: string) => chem.canonicalSmiles(chem.parseStructure(`[Xe]${smiles}`));
const spellings = new Map<string, string>();
for (const [label, smiles, , ...more] of NICKNAME_DATA) {
  const group = capped(smiles);
  for (const s of [label, ...more]) {
    assert.ok(!isElement(s) && !standsIn(s), `${s} is an element or a generic label`);
    assert.ok(!spellings.has(s) || spellings.get(s) === group, `${s} is spelt for two groups`);
    spellings.set(s, group);
    // Octet's own reading wins: a spelling it reads is in the list only when it reads the same group.
    const read = labelSmiles(s);
    assert.ok(read, `${s} reads nothing`);
    assert.equal(capped(read), group, `${s} reads another group than its nickname`);
  }
}
assert.ok(BUILT_IN.length >= 340, "Octet's nicknames are there");
for (const [s, want] of Object.entries({ Morph: "N1CCOCC1", TBDPS: "[Si](c1ccccc1)(c1ccccc1)C(C)(C)C", "2-Py": "c1ccccn1", Pbf: undefined, MeO: "OC" }))
  if (want) assert.equal(capped(labelSmiles(s)!), capped(want), s);
  else assert.ok(builtInNickname(s), s);
// Labels Octet reads its own way are read as before (labels.check.ts has the rest).
for (const [s, want] of Object.entries({ OMe: "OC", Ph: "c1ccccc1", Ns: "S(=O)(=O)c1ccc([N+](=O)[O-])cc1", CO2Et: "C(=O)OCC" })) assert.equal(capped(labelSmiles(s)!), capped(want), s);
// Inside a longer label, a word Octet reads no group in is the nickname it spells (NHPbf, N(Pbf)2, CH2ODMTr), after
// Octet's own reading and after a whole-label nickname (BzlO is benzyloxy, not Bzl read as a word). A word Octet splits
// otherwise stays as it was (CH2Morph is Mo and rph: nothing read).
for (const [s, want] of Object.entries({ NHPbf: `N${builtInNickname("Pbf")!.smiles}`, "N(Pbf)2": `N(${builtInNickname("Pbf")!.smiles})${builtInNickname("Pbf")!.smiles}`,
  CH2ODMTr: `CO${builtInNickname("DMTr")!.smiles}`, BzlO: "OCc1ccccc1", NHSEM: `N${builtInNickname("SEM")!.smiles}` }))
  assert.equal(capped(labelSmiles(s)!), capped(want), s);
assert.equal(labelSmiles("CH2Morph"), undefined);
// Elements stay elements: Ac typed on an atom is actinium, as before.
assert.ok(!builtInNickname("Ac") && !builtInNickname("Np") && !builtInNickname("Pr"));

// The user's own, as the settings keep them.
assert.deepEqual(readNicknames([{ label: "OPv", smiles: "OC(=O)C(C)(C)C" }, { label: "OPv", smiles: "C" }, { label: "a b", smiles: "C" }, { label: "X", smiles: "*C" }, { label: "Y" }, "Z", null]),
  [{ label: "OPv", smiles: "OC(=O)C(C)(C)C" }]);
assert.deepEqual(readNicknames("no"), []);
assert.equal(readNicknames(Array.from({ length: 600 }, (_, k) => ({ label: `N${k}`, smiles: "C" }))).length, MOST_OWN_NICKNAMES);
assert.deepEqual(withNickname([{ label: "A1", smiles: "C" }], { label: "A1", smiles: "CC" }), [{ label: "A1", smiles: "CC" }]);
assert.deepEqual(withoutNickname([{ label: "A1", smiles: "C" }, { label: "B1", smiles: "C" }], "A1"), [{ label: "B1", smiles: "C" }]);
assert.ok(nicknameProblem("Cl") && nicknameProblem("R") && nicknameProblem("a b") && nicknameProblem("") && nicknameProblem("x".repeat(33)));
assert.equal(nicknameProblem("OPv"), undefined);
assert.equal(nicknameProblem("OMe"), undefined, "a label Octet reads may be the user's own: theirs comes first");

// Define Nickname: methyl pivalate, the pivaloyloxy group selected (all but the methyl).
const A = (label: string, x: number, y: number) => ({ label, location: [x, y, 0] as [number, number, number] });
const ester: Mol = {
  atoms: [A("C", 0, 0), A("O", 1, 0), A("C", 2, 0), A("O", 2, 1), A("C", 3, 0), A("C", 4, 0), A("C", 3, 1), A("C", 3, -1)],
  bonds: [[0, 1, 1], [1, 2, 1], [2, 3, 2], [2, 4, 1], [4, 5, 1], [4, 6, 1], [4, 7, 1]].map(([a, b, type]) => ({ atoms: [a, b] as [number, number], type })),
};
const made = chem.nicknameGroup(ester, new Set([1, 2, 3, 4, 5, 6, 7]));
assert.ok(typeof made !== "string", String(made));
assert.equal(made.keep, 1);
assert.equal(capped(made.smiles), capped("OC(=O)C(C)(C)C"));
assert.equal(typeof chem.nicknameGroup(ester, new Set(ester.atoms.map((_, i) => i))), "string", "a whole structure has no bond to join by");
assert.equal(typeof chem.nicknameGroup(ester, new Set([2, 3])), "string", "two bonds to the rest");
assert.equal(typeof chem.nicknameGroup(ester, new Set([3])), "string", "a double bond to the rest");
// A group with a label in it is written out.
const labelled = setLabel(ester, 4, "tBu");
const withLabel = chem.nicknameGroup({ ...labelled, atoms: labelled.atoms.slice(0, 5), bonds: labelled.bonds.slice(0, 4) }, new Set([1, 2, 3, 4]));
assert.ok(typeof withLabel !== "string" && capped(withLabel.smiles) === capped("OC(=O)C(C)(C)C"), JSON.stringify(withLabel));

// Kept: typed on an atom it reads as the group, in the formula, SMILES and CDXML (as a fragment ChemDraw opens).
setOwnNicknames([{ label: "OPv", smiles: made.smiles }]);
const typed = setLabel({ atoms: [A("C", 0, 0), A("C", 1, 0)], bonds: [{ atoms: [0, 1], type: 1 }] }, 1, "OPv");
assert.equal(typed.atoms[1].text, "OPv");
assert.equal(chem.analyse(typed)?.[0]?.formula, "C6H12O2", "methyl pivalate");
assert.equal(chem.canonicalSmiles(chem.expandLabels(typed)), chem.canonicalSmiles(chem.parseStructure("COC(=O)C(C)(C)C")));
const xml = toCdxml(typed, DEFAULT_STYLE, { expand: (t) => { const s = labelSmiles(t); return s ? chem.parseStructure(s) : undefined; } });
assert.match(xml, /NodeType="Fragment"/);
const back = fromCdxml(xml).mol;
assert.equal(chem.analyse(back)?.[0]?.formula, "C6H12O2", "read back from CDXML");
// The file keeps the group as the label's own, so Octet on a computer without the nickname reads it too.
const kept = toCdxml(typed, DEFAULT_STYLE, { expand: (t) => { const s = labelSmiles(t); return s ? chem.parseStructure(s) : undefined; }, own: (t) => t === "OPv" });
setOwnNicknames([]);
assert.equal(chem.analyse(fromCdxml(kept).mol)?.[0]?.formula, "C6H12O2", "opened where the nickname is not known");
assert.notEqual(chem.analyse(fromCdxml(xml).mol)?.[0]?.formula, "C6H12O2", "Octet's own labels are read from their text, as before");
setOwnNicknames([{ label: "OPv", smiles: made.smiles }]);
// Contracted where it was defined: the same structure.
const contracted = contractLabel(ester, made.keep, new Set(made.group), "OPv");
assert.equal(chem.analyse(contracted)?.[0]?.formula, "C6H12O2");
// A user's nickname comes before Octet's reading, and goes when removed (nothing read before is kept).
assert.equal(chem.analyse(typed)?.[0]?.formula, "C6H12O2");
setOwnNicknames([]);
assert.equal(labelSmiles("OPv"), undefined);
assert.notEqual(chem.analyse(typed)?.[0]?.formula, "C6H12O2");
setOwnNicknames([{ label: "Zq", smiles: "C(C)=O" }]);
assert.equal(capped(labelSmiles("NHZq")!), capped("NC(C)=O"), "a nickname of the user's own inside a longer label");
setOwnNicknames([{ label: "Ph", smiles: "C1CCCCC1" }]);
assert.equal(capped(labelSmiles("Ph")!), capped("C1CCCCC1"));
setOwnNicknames([]);
assert.equal(capped(labelSmiles("Ph")!), capped("c1ccccc1"));
console.log(`nicknames.check: ${BUILT_IN.length} built-in nicknames, ${spellings.size} spellings; own nicknames ok`);
