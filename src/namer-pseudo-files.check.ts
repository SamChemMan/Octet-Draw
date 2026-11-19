// Run: node src/namer-pseudo-files.check.ts. A structure named with r and s (issue 82), saved with its name caption
// and opened again: .oct, CDXML and CDX as ChemDraw reads them (the CDXML alone, without Octet's own copy), and MOL,
// SDF and SMILES. The structure has the same name again, and the caption keeps its text and its italic r and s.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { browser, loadOpsin, needOpsin, opsinDir } from "../scripts/checkkit.ts";
import type { Mol } from "./render.ts";

needOpsin("namer-pseudo-files: skipped (no OPSIN build)");
browser();
const chem = await import("./chem.ts");
await chem.ready;
const opsin = await loadOpsin();
const { attachOpsin, knownName, nameToSmiles, setPseudoReader } = await import("./names.ts");
attachOpsin(opsin, readFileSync(new URL("names.txt", opsinDir), "utf8"));
const { checkedName, namerName, setCageCheck, setNamer } = await import("./naming.ts");
const { iupacName } = await import("./namer.ts");
const { pseudoReader } = await import("./pseudo.ts");
const { nameRuns } = await import("./nametype.ts");
const { addCaption } = await import("./edit.ts");
const { readOct, readCdx, writeCdx, writeOct } = await import("./oct.ts");
const { fromCdxml, parseXml, toCdxml } = await import("./cdxml.ts");
const { cdxToXml, xmlToCdx } = await import("./cdx.ts");
const { DEFAULT_STYLE } = await import("./docstyle.ts");
setNamer(iupacName);
setPseudoReader(pseudoReader({ mol: (s) => chem.parseStructure(s, false), inchi: chem.toInchi, cip: chem.cipOf, name: namerName }));
setCageCheck(chem.toInchiAux);
const inchiOf = (s: Mol | string) => { try { return chem.toInchi(typeof s === "string" ? chem.parseStructure(s, false) : s); } catch { return undefined; } };
const nameFor = (m: Mol) => checkedName(m, chem.expandLabels(m), nameToSmiles, inchiOf, chem.cipOf, knownName);
// The structure alone (its atoms and bonds), as Structure to Name takes it.
const structure = (m: Mol): Mol => ({ atoms: m.atoms, bonds: m.bonds });
const italics = (c: { text: string; runs?: { text: string; italic?: boolean }[] }) => (c.runs ?? []).filter((r) => r.italic).map((r) => r.text).join("");

for (const [what, smiles, want] of [
  ["xylitol", "OC[C@@H](O)[C@H](O)[C@@H](O)CO", "(2R,3r,4S)-pentane-1,2,3,4,5-pentaol"],
  ["trans-tranexamic acid", "NC[C@H]1CC[C@@H](CC1)C(O)=O", "(1r,4r)-4-(aminomethyl)cyclohexane-1-carboxylic acid"],
  ["trans-decalin", "C1CC[C@H]2CCCC[C@@H]2C1", "(4ar,8ar)-decahydronaphthalene"],
] as const) {
  const drawn = chem.parseStructure(smiles), name = nameFor(drawn);
  assert.equal(name, want, what);
  // The caption as Structure to Name adds it: under the structure, its descriptors in italic.
  const runs = nameRuns(name!), [m] = addCaption(drawn, { text: name!, runs, x: 0, y: 0, under: drawn.atoms.map((_, i) => i) });
  const letters = italics({ text: name!, runs });
  assert.match(letters, /[rs]/, `${what}: r and s are italic`);
  const opened: [string, Mol][] = [
    [".oct", readOct(writeOct(m, DEFAULT_STYLE), true).mol],
    ["CDXML", fromCdxml(toCdxml(m, DEFAULT_STYLE)).mol],
    // ChemDraw's CDX, read as ChemDraw's drawing (without Octet's own copy of it).
    ["CDX", fromCdxml(cdxToXml(xmlToCdx(parseXml(toCdxml(m, DEFAULT_STYLE))))).mol],
    [".cdx (Octet's)", readCdx(writeCdx(m, DEFAULT_STYLE)).mol],
  ];
  for (const [kind, back] of opened) {
    assert.equal(nameFor(structure(back)), want, `${what} from ${kind}: named again`);
    const c = back.captions?.find((x) => x.text === want);
    assert.ok(c, `${what} from ${kind}: the caption keeps its text`);
    assert.equal(italics(c!), letters, `${what} from ${kind}: the caption keeps its italic descriptors`);
  }
  for (const [kind, text] of [["MOL", chem.toMolfile(drawn)], ["MOL V2000", chem.toMolfile(drawn, true)], ["SDF", chem.toSdf(drawn)], ["SMILES", chem.toSmiles(drawn)]] as const)
    assert.equal(nameFor(chem.parseStructure(text)), want, `${what} from ${kind}: named again`);
}
console.log("namer-pseudo-files: xylitol, trans-tranexamic acid and trans-decalin named again from .oct, CDXML, CDX, MOL, SDF and SMILES, captions in italic ok");
