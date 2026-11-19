// Run: node src/names-stress.check.ts. Issue 82's stress list (docs/plans/issue-82-names.md), the cases Octet with no
// window can check. namer-pseudo.check.ts has the rest of the reader and namer cases (stress 2, 3, 5, 6, 8, 10, 11 and
// 22 to 25), namer-pseudo-files.check.ts the files (15) and namer-pseudo-mcp.check.ts the AI apps' tools (26). Stress
// 13, 14 and 16 to 18 are the app's own Structure to Name, windows, ChemDraw and themes, which this item leaves as
// they were.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { browser, loadOpsin, needOpsin, opsinDir } from "../scripts/checkkit.ts";
import type { Mol } from "./render.ts";

needOpsin("names-stress: skipped (no OPSIN build)");
browser();
const chem = await import("./chem.ts");
await chem.ready;
const opsin = await loadOpsin();
const { attachOpsin, knownName, nameToSmiles, setPseudoReader } = await import("./names.ts");
attachOpsin(opsin, readFileSync(new URL("names.txt", opsinDir), "utf8"));
const { checkedName, namerName, setCageCheck, setNamer } = await import("./naming.ts");
const { iupacName } = await import("./namer.ts");
const { MOST_PSEUDO_ATOMS, pseudoReader, pseudoSmiles } = await import("./pseudo.ts");
const { EMPTY, addChair, deleteAtom, labelable, setLabel, sprout } = await import("./edit.ts");
// As Editor.tsx wires them.
setNamer(iupacName);
const api = { mol: (s: string) => chem.parseStructure(s, false), inchi: chem.toInchi, cip: chem.cipOf, name: namerName };
const wire = (on: boolean) => { setPseudoReader(on ? pseudoReader(api) : undefined); setCageCheck(on ? chem.toInchiAux : undefined); };
wire(true);
const inchiOf = (s: Mol | string) => { try { return chem.toInchi(typeof s === "string" ? chem.parseStructure(s, false) : s); } catch { return undefined; } };
const nameFor = (m: Mol, cip = chem.cipOf) => checkedName(m, chem.expandLabels(m), nameToSmiles, inchiOf, cip, knownName);
const drawn = (smiles: string) => chem.parseStructure(smiles);
const median = (t: number[]) => [...t].sort((x, y) => x - y)[t.length >> 1];
// A time bound, measured again once before a failure counts (the machine may be busy).
const within = (what: string, ms: () => number, bound: number) => { let t = ms(); if (t > bound) t = ms(); assert.ok(t <= bound, `${what}: ${t.toFixed(1)} ms, bound ${bound} ms`); return t; };

// 1. An empty drawing: nothing named, no exception.
assert.equal(nameFor(EMPTY), undefined, "empty drawing");

// 4. trans- and cis-4-tert-butylcyclohexan-1-ol as each chair (Chair tool, labels axial or equatorial) and flat.
{
  const chair = (): Mol => addChair(EMPTY, 1, { point: [0, 0], turn: 0 });
  const onChair = (m: Mol, i: number, text: string, axial: boolean) => {
    m = sprout(m, i);
    if (!axial) { m = sprout(m, i); m = deleteAtom(m, m.atoms.length - 2); }
    return setLabel(m, m.atoms.length - 1, text);
  };
  const both = (oh: boolean, tbu: boolean) => onChair(onChair(chair(), 0, "OH", oh), 3, "tBu", tbu);
  const trans = "(1r,4r)-4-tert-butylcyclohexan-1-ol", cis = "(1s,4s)-4-tert-butylcyclohexan-1-ol";
  for (const [what, m, want] of [["chair, both equatorial", both(false, false), trans], ["chair, both axial", both(true, true), trans], ["chair, OH equatorial, tBu axial", both(false, true), cis],
    ["chair, OH axial, tBu equatorial", both(true, false), cis], ["flat, wedges", drawn("CC(C)(C)[C@H]1CC[C@H](O)CC1"), trans], ["flat, wedges", drawn("CC(C)(C)[C@H]1CC[C@@H](O)CC1"), cis]] as const)
    assert.equal(nameFor(m), want, `4-tert-butylcyclohexan-1-ol, ${what}`);
}

// 7. Typed names: R or S on a pseudoasymmetric centre, a locant the structure does not have, a letter that is not a
// descriptor, one centre given twice: no structure. r or s on an ordinary centre reads as OPSIN reads it (R or S),
// as in 1.1.2.
for (const name of ["(1R,4R)-4-methylcyclohexan-1-ol", "(9r)-pentane-1,2,3,4,5-pentol", "(1r,4q)-4-methylcyclohexan-1-ol", "(1r,1s)-4-methylcyclohexan-1-ol", "(1r,4s)-4-methylcyclohexan-1-ol"])
  assert.equal(nameToSmiles(name), undefined, name);
assert.equal(inchiOf(nameToSmiles("(1r,3r)-3-methylcyclohexan-1-ol") ?? ""), inchiOf(opsin.parseToSmiles("(1R,3R)-3-methylcyclohexan-1-ol")), "(1r,3r)-3-methylcyclohexan-1-ol reads as (1R,3R)");

// 9. Seven or more open centres (four 1,4-cyclohexylene rings in a row: 8): no name, quickly.
{
  const rings = drawn("C[C@H]1CC[C@@H](CC1)[C@H]1CC[C@@H](CC1)[C@H]1CC[C@@H](CC1)[C@H]1CC[C@@H](C)CC1");
  let name: string | undefined = "";
  const ms = within("eight open centres", () => { const t = performance.now(); name = nameFor(rings); return performance.now() - t; }, 500);
  assert.equal(name, undefined, "eight open centres: no name");
  console.log(`names-stress: eight open centres, no name in ${ms.toFixed(0)} ms ok`);
}

// 12. A structure with an r centre and a label other than R, S, r, s, E and Z (here c on its double bond): no name.
{
  const m = drawn("C/C=C/[C@H]1CC[C@@H](O)CC1");
  assert.ok(nameFor(m), "named with its E");
  const withC = (x: Mol) => { const c = chem.cipOf(x); return { atoms: c.atoms, bonds: c.bonds.map((b) => (b === "E" ? "c" : b)) }; };
  assert.equal(nameFor(m, withC), undefined, "an r centre and a c double bond: no name");
}

// 19. 40 paclitaxels named (no r or s, an InChI with /m: neither the reader nor the cage check runs), in the time
// they take without the reader and the cage check (as before this item), within noise.
{
  const taxol = drawn("CC1=C2[C@@]([C@]([C@H]([C@@H]3[C@]4([C@H](OC4)C[C@@H]([C@]3(C(=O)[C@@H]2OC(=O)C)C)O)OC(=O)C)OC(=O)c5ccccc5)(C[C@@H]1OC(=O)[C@H](O)[C@@H](NC(=O)c6ccccc6)c7ccccc7)O)(C)C");
  const want = nameFor(taxol);
  assert.ok(want, "paclitaxel is named");
  const forty = () => { const t = performance.now(); for (let k = 0; k < 40; k++) assert.equal(nameFor(taxol), want); return performance.now() - t; };
  const runs = (on: boolean) => { wire(on); const t = forty(); wire(true); return t; };
  const ratio = () => { const off: number[] = [], on: number[] = []; for (let r = 0; r < 3; r++) { off.push(runs(false)); on.push(runs(true)); } return median(on) / median(off); };
  let r = ratio();
  if (r > 1.15) r = ratio();
  assert.ok(r <= 1.15, `40 paclitaxels: ${r.toFixed(2)} times as long as without the reader`);
  console.log(`names-stress: 40 paclitaxels named, ${r.toFixed(2)} times the time without the reader and the cage check ok`);
}

// 20. A name with r or s for a structure over the reader's atoms: no reading, no work.
{
  const big = `${"C".repeat(MOST_PSEUDO_ATOMS)}[C@H]1CC[C@@H](O)CC1`;
  within("a reading past the atom limit", () => { const t = performance.now(); assert.equal(pseudoSmiles("(1r,4r)-4-alkylcyclohexan-1-ol", () => big, api), undefined); return performance.now() - t; }, 20);
}

// 27. A caption of 3,000 characters of descriptors (pasted from CDXML): not an atom label, and no structure, under
// 50 ms each.
{
  const text = `${"(1r,4r)-".repeat(375)}4-methylcyclohexan-1-ol`;
  within("a 3,000-character name", () => { const t = performance.now(); assert.equal(nameToSmiles(text), undefined); assert.equal(labelable({ id: 1, text, x: 0, y: 0 }), false); return performance.now() - t; }, 50);
}
console.log("names-stress: stress 1, 4, 7, 9, 12, 19, 20 and 27 ok");
