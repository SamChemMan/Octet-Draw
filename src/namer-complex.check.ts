// Run: node src/namer-complex.check.ts. Names for coordination compounds (complexes.ts), by additive nomenclature
// (IUPAC 2005 Red Book IR-9, IR-10). Each structure is drawn from SMILES as Octet draws it (a bracket atom with
// hydrogens on a metal, [NH3], as the label NH3), and must get exactly the name given here; complexes.ts gives a name
// only when its own check reads it back as the drawing. Then names one term away from right must fail that check,
// structures Octet cannot name yet must get no name, and a large complex must be named quickly.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import type { Mol } from "./render.ts";

const dir = new URL("./vendor/opsin/", import.meta.url);
if (!existsSync(new URL("opsin.js", dir))) { console.log("namer-complex.check: skipped (no OPSIN build)"); process.exit(0); }
// chem.ts reads the drawing tokens and loads Indigo's wasm as a browser does; these stand in for the browser.
const gl = globalThis as Record<string, unknown>;
gl.document = { documentElement: {}, createElement: () => ({ getContext: () => ({}) }) };
gl.getComputedStyle = () => ({ getPropertyValue: () => "10" });
gl.window = globalThis;
gl.self = { location: { origin: "file://" } };
gl.fetch = async (u: URL | string) => new Response(readFileSync(new URL(String(u))), { headers: { "content-type": "application/wasm" } });
const chem = await import("./chem.ts");
await chem.ready;
const pack = readFileSync(new URL("opsin-data.bin", dir)), files = new Map<string, Int8Array>();
for (let p = 0; ; ) {
  const n = pack.readUInt16BE(p); p += 2;
  if (!n) break;
  const name = pack.toString("latin1", p, p + n); p += n;
  const size = pack.readInt32BE(p); p += 4;
  files.set(name, new Int8Array(pack.buffer, pack.byteOffset + p, size)); p += size;
}
gl.opsinResource = (name: string) => files.get(name) ?? null;
const opsin = await import(new URL("opsin.js", dir).href);
opsin.init();
const { attachOpsin, nameToAtoms, nameToSmiles } = await import("./names.ts");
attachOpsin(opsin, readFileSync(new URL("names.txt", dir), "utf8"));
const { complexName, complexNameReads } = await import("./complexes.ts");
// As the app names: OPSIN through names.ts, InChI and CIP labels by Indigo through chem.ts.
const api = { read: nameToSmiles, atoms: nameToAtoms, inchi: chem.toInchi, cip: chem.cipOf };

// A structure drawn from SMILES, labels expanded as Structure to Name expands them. A bracket atom with hydrogens bonded
// to a metal is drawn as its label (NH3, OH2), as Sam draws ammine and aqua ligands.
const METALS = /^\[(?:Li|Na|K|Mg|Ca|Ti|V|Cr|Mn|Fe|Co|Ni|Cu|Zn|Zr|Mo|Ru|Rh|Pd|Ag|W|Re|Os|Ir|Pt|Au)\b/;
function drawn(smiles: string): Mol {
  const m = chem.parseStructure(smiles), tokens = [...smiles.matchAll(/\[[^\]]+\]|Cl|Br|[BCNOPSFI]|[bcnops]/g)].map((t) => t[0]);
  assert.equal(tokens.length, m.atoms.length, `atoms of ${smiles}`);
  const metal = new Set(tokens.flatMap((t, i) => (METALS.test(t) ? [i] : [])));
  const atoms = m.atoms.map((a, i) => {
    const h = /^\[([A-Z][a-z]?)H(\d*)/.exec(tokens[i]);
    const onMetal = m.bonds.some((b) => b.atoms.includes(i) && metal.has(b.atoms[0] === i ? b.atoms[1] : b.atoms[0]));
    return h && onMetal ? { ...a, text: `${h[1]}H${h[2]}` } : a;
  });
  return chem.expandLabels({ ...m, atoms });
}
const nameOf = (smiles: string) => complexName(drawn(smiles), api);

// Sam's complexes (his ChemDraw drawings, as SMILES written here). They are drawn with no charges, so the metal is in
// oxidation state 0 as drawn (IR-9.2.2.4: Arabic zero); drawn with the 2+ charge, the names end (2+).
const SAM: [string, string, string][] = [
  // Os(II) bis(terpyridine) photocatalysts. Three or more identical rings in a chain are a ring assembly (P-28.2.1):
  // 2,2':6',2''-terpyridine, the rings primed in turn, each N its ring's 1; κ3N1,N1',N1'' cites all three (IR-9.2.4.2).
  ["Os(tpy)2", "C12=N([Os]345(N6C(C7N3=C(C3C=CC=CN=34)C=CC=7)=CC=CC=6)N3=C1C=CC=C3C1N5=CC=CC=1)C=CC=C2", "bis(2,2':6',2''-terpyridine-κ3N1,N1',N1'')osmium(0)"],
  ["Os(MeOPh-tpy)2", "C12=N([Os]345(N6C(C7N3=C(C3C=CC=CN=34)C=C(C3C=CC(OC)=CC=3)C=7)=CC=CC=6)N3=C1C=C(C1C=CC(OC)=CC=1)C=C3C1N5=CC=CC=1)C=CC=C2",
    "bis[4'-(4-methoxyphenyl)-2,2':6',2''-terpyridine-κ3N1,N1',N1'']osmium(0)"],
  ["Os(MeOPh-tpy)2, drawn the other way", "C1C=C2C3C=C(C4C=CC(OC)=CC=4)C=C4C5C=CC=C[N]=5[Os]56([N]7C(C8C=CC=C[N]=85)=CC(C5C=CC(OC)=CC=5)=CC=7C5=CC=CC=[N]56)([N]2=CC=1)[N]=34",
    "bis[4'-(4-methoxyphenyl)-2,2':6',2''-terpyridine-κ3N1,N1',N1'']osmium(0)"],
  // The pyrimidinyl ligand: pyrimidine is the senior ring (P-44.2.1.2), so the namer's name has it as parent and the
  // other rings as substituents. Each donor N is cited after the part of the name that holds it (IR-9.2.4.2).
  ["Os(pym-py-pym)2", "C12=N([Os]345(N6C(C7N3=C(C3N=CC=CN=34)C=C(C3C=CC(OC)=CC=3)C=7)=NC=CC=6)N3=C1C=C(C1C=CC(OC)=CC=1)C=C3C1N5=CC=CN=1)C=CC=N2",
    "bis{2-[4-(4-methoxyphenyl)-6-(pyrimidin-2-yl-κN1)pyridin-2-yl-κN1]pyrimidine-κN1}osmium(0)"],
  ["Os(pym-py-pym)2, drawn the other way", "[Os]1234([N]5C(=NC=CC=5)C5=[N]1C(=CC(C1C=CC(OC)=CC=1)=C5)C1=[N]2C=CC=N1)[N]1C(=NC=CC=1)C1=[N]3C(=CC(C2C=CC(OC)=CC=2)=C1)C1=[N]4C=CC=N1",
    "bis{2-[4-(4-methoxyphenyl)-6-(pyrimidin-2-yl-κN1)pyridin-2-yl-κN1]pyrimidine-κN1}osmium(0)"],
  ["Ru(bpy)3", "C12C3=CC=CC=N3[Ru]34(N5=CC=CC=C5C5N3=CC=CC=5)(N=1C=CC=C2)N1=C(C2C=CC=CN=24)C=CC=C1", "tris(2,2'-bipyridine-κ2N1,N1')ruthenium(0)"],
  // Sam's file labels this Os "Os(II)", which Octet reads as Os with an I-I group; drawn as Os, phenanthroline's N
  // atoms are 1 and 10 (fused ring numbering, P-25.3).
  ["Os(phen)3", "[Os]123(N4=CC=CC5=CC=C6C=CC=N1C6=C54)(N1=CC=CC4=CC=C5C=CC=N2C5=C41)N1=CC=CC2=CC=C4C=CC=N3C4=C21", "tris(1,10-phenanthroline-κ2N1,N10)osmium(0)"],
  // Jacobsen's catalyst. The salen dianion as the namer names it, with its (R,R) cyclohexane. Its C=N bonds are in the
  // chelate rings, so their E or Z is the chelate's and is not cited. All of its N and O atoms bond to Mn: κ2N,N',κ2O,O'
  // leaves no doubt (IR-9.2.4.2: primes in simple cases). Mn(III): two phenolate O and chloride, three negative charges.
  ["Jacobsen's catalyst", "[C@H]12[N]3[Mn]4(Cl)([N]([C@@H]1CCCC2)=CC1=CC(C(C)(C)C)=CC(C(C)(C)C)=C1O4)OC1=C(C=3)C=C(C(C)(C)C)C=C1C(C)(C)C",
    "chlorido(2,4-di-tert-butyl-6-{{{(1R,2R)-2-{[(3,5-di-tert-butyl-2-oxidophenyl)methylidene]amino}cyclohexyl}imino}methyl}phenolato-κ2N,N',κ2O,O')manganese(III)"],
];
const ESP = "[Rh]%10%11%12%13%14.[Rh]%10%15%16%17%18.O%11C(=O%15)C(C)(C)Cc1cccc(c1)CC(C)(C)C(O%16)=O%12.O%13C(=O%17)C(C)(C)Cc1cccc(c1)CC(C)(C)C(O%18)=O%14";
const OTHERS: [string, string, string][] = [
  // A complex ion takes its charge number (IR-9.2.2.4); its counter-ions follow, their number given by the charges.
  ["[Ru(bpy)3]2+", "C12C3=CC=CC=N3[Ru+2]34(N5=CC=CC=C5C5N3=CC=CC=5)(N=1C=CC=C2)N1=C(C2C=CC=CN=24)C=CC=C1", "tris(2,2'-bipyridine-κ2N1,N1')ruthenium(2+)"],
  ["[Ru(bpy)3](PF6)2", "C12C3=CC=CC=N3[Ru+2]34(N5=CC=CC=C5C5N3=CC=CC=5)(N=1C=CC=C2)N1=C(C2C=CC=CN=24)C=CC=C1.F[P-](F)(F)(F)(F)F.F[P-](F)(F)(F)(F)F",
    "tris(2,2'-bipyridine-κ2N1,N1')ruthenium(2+) hexafluorophosphate"],
  // An anion's central atom takes -ate (IR-9.2.2, Table X: ferrate); cations come first (IR-5.4).
  ["K3[Fe(CN)6]", "[K+].[K+].[K+].N#C[Fe-3](C#N)(C#N)(C#N)(C#N)C#N", "potassium hexacyanidoferrate(3-)"],
  ["K4[Fe(CN)6]", "[K+].[K+].[K+].[K+].N#C[Fe-4](C#N)(C#N)(C#N)(C#N)C#N", "potassium hexacyanidoferrate(4-)"],
  ["K2[PtCl4]", "[K+].[K+].Cl[Pt-2](Cl)(Cl)Cl", "potassium tetrachloridoplatinate(2-)"],
  // No elision in tetraammine, hexaammine (IR-9.2.2.2). Cisplatin's cis is not given: polyhedral configuration is not
  // read from the drawing.
  ["cisplatin", "[NH3][Pt](Cl)(Cl)[NH3]", "diamminedichloridoplatinum(II)"],
  ["[Co(NH3)6]Cl3", "[NH3][Co+3]([NH3])([NH3])([NH3])([NH3])[NH3].[Cl-].[Cl-].[Cl-]", "hexaamminecobalt(3+) chloride"],
  ["Wilkinson's catalyst", "Cl[Rh](P(c1ccccc1)(c1ccccc1)c1ccccc1)(P(c1ccccc1)(c1ccccc1)c1ccccc1)P(c1ccccc1)(c1ccccc1)c1ccccc1", "chloridotris(triphenylphosphane)rhodium(I)"],
  ["Pd(PPh3)4", "C1=CC=C(C=C1)P(C1=CC=CC=C1)(C1=CC=CC=C1)[Pd](P(C1=CC=CC=C1)(C1=CC=CC=C1)C1=CC=CC=C1)(P(C1=CC=CC=C1)(C1=CC=CC=C1)C1=CC=CC=C1)P(C1=CC=CC=C1)(C1=CC=CC=C1)C1=CC=CC=C1",
    "tetrakis(triphenylphosphane)palladium(0)"],
  ["[Cu(en)2]2+", "C1C[NH2][Cu+2]2([NH2]1)[NH2]CC[NH2]2", "bis(ethane-1,2-diamine-κ2N,N')copper(2+)"],
  ["PtCl2(py)2", "Cl[Pt](Cl)(N1=CC=CC=C1)N1=CC=CC=C1", "dichloridobis(pyridine)platinum(II)"],
  // N-bonded nitrite (IR-9.2.4.2: nitrito-κN), drawn N+ and O-.
  ["[Co(NH3)5(NO2)]Cl2", "[O-][N+](=O)[Co+2]([NH3])([NH3])([NH3])([NH3])[NH3].[Cl-].[Cl-]", "pentaammine(nitrito-κN)cobalt(2+) chloride"],
  // A monodentate carboxylate needs no κ (IR-9.2.4.1).
  ["Pd(OAc)2(PPh3)2", "CC(=O)O[Pd](OC(C)=O)(P(c1ccccc1)(c1ccccc1)c1ccccc1)P(c1ccccc1)(c1ccccc1)c1ccccc1", "bis(acetato)bis(triphenylphosphane)palladium(II)"],
  // Carboplatin: one O of each carboxylate group, O and O'' with the O atoms numbered along the name (O, O' those of
  // the first group; as the Red Book numbers edta's, IR-9.2.5.2 Example 5).
  ["carboplatin", "[NH3][Pt]1(OC(=O)C2(CCC2)C(=O)O1)[NH3]", "diammine(cyclobutane-1,1-dicarboxylato-κ2O,O'')platinum(II)"],
  // acac drawn as its enolate: 4-oxopent-2-en-2-olate, both O atoms donors.
  ["Fe(acac)3", "CC1=CC(C)=O[Fe]23(O1)(OC(C)=CC(C)=O2)OC(C)=CC(C)=O3", "tris(4-oxopent-2-en-2-olato-κ2O,O')iron(III)"],
  ["Cu(acac)2", "CC1=CC(C)=O[Cu]2(O1)OC(C)=CC(C)=O2", "bis(4-oxopent-2-en-2-olato-κ2O,O')copper(II)"],
  // edta, hexadentate: each N and one O of each carboxylate group bonds to Co. The namer's name for the ligand, each
  // donor cited after its part (IR-9.2.4.2, as the Red Book's second name for Example 8).
  ["Na[Co(edta)]", "[Na+].[Co-]%11%12%13%14%15[N](CC(=O)O%11)(CC(=O)O%12)CC[N]%15(CC(=O)O%13)CC(=O)O%14",
    "sodium ({{2-[bis(carboxylatomethyl-κO)amino-κN]ethyl}(carboxylatomethyl-κO)amino-κN}acetato-κO)cobaltate(1-)"],
  // Organometallic: carbon ligands as substituent prefixes (IR-10.2.2), carbenes as -ylidene (IR-10.2.4), and no
  // oxidation number (IR-10.2.1.4). The NHC's name begins under b (bis), before chlorido.
  ["Grubbs II", "Cl[Ru](Cl)(=CC1=CC=CC=C1)(=C1N(C2=C(C)C=C(C)C=C2C)CCN1C1=C(C)C=C(C)C=C1C)P(C1CCCCC1)(C1CCCCC1)C1CCCCC1",
    "[1,3-bis(2,4,6-trimethylphenyl)imidazolidin-2-ylidene]dichlorido(phenylmethylidene)(tricyclohexylphosphane)ruthenium"],
  ["Vaska's complex", "Cl[Ir](=C=O)(P(c1ccccc1)(c1ccccc1)c1ccccc1)P(c1ccccc1)(c1ccccc1)c1ccccc1", "carbonylchloridobis(triphenylphosphane)iridium"],
  // Rh2(OAc)4: four bridging acetates, each O to one Rh (IR-9.2.5.4 Example 6), and the Rh-Rh bond (IR-9.2.5.3).
  ["Rh2(OAc)4", "[Rh]%10%13%14(OC(C)=O%11)OC(C)=O%12.[Rh]%10%11%12(OC(C)=O%13)OC(C)=O%14", "tetrakis(μ-acetato-κO:κO')dirhodium(Rh—Rh)"],
  // A carbene on one Rh: the Rh atoms are no longer alike, so each κ names its Rh, the carbene's Rh (more donor atoms)
  // 1 (IR-9.2.5.5).
  ["Rh2(OAc)4 carbene", "[Rh]%10%13%14(=C(C(=O)OC)c1ccccc1)(OC(C)=O%11)OC(C)=O%12.[Rh]%10%11%12(OC(C)=O%13)OC(C)=O%14",
    "tetrakis(μ-acetato-1κO:2κO')(2-methoxy-2-oxo-1-phenylethylidene-1κC)dirhodium(Rh—Rh)"],
  // Rh2(esp)2: esp named as two identical units on a benzene ring (multiplicative name, P-15.3), each carboxylate O to
  // one Rh: the κ in the multiplied unit applies to each unit (IR-9.2.4.2). Its primes are OPSIN's O and O' of the unit.
  ["Rh2(esp)2", ESP, "bis[μ-3,3'-(1,3-phenylene)bis(2,2-dimethylpropanoato-κO:κO')]dirhodium(Rh—Rh)"],
  ["Rh2(esp)2 carbene", ESP.replace("[Rh]%10%11%12%13%14", "[Rh]%10%11%12%13%14=C(C(=O)OC)c1ccccc1"),
    "(2-methoxy-2-oxo-1-phenylethylidene-1κC)bis[μ-3,3'-(1,3-phenylene)bis(2,2-dimethylpropanoato-1κO:2κO')]dirhodium(Rh—Rh)"],
  ["Mn2(CO)10", "O=C=[Mn](=C=O)(=C=O)(=C=O)(=C=O)[Mn](=C=O)(=C=O)(=C=O)(=C=O)=C=O", "bis(pentacarbonylmanganese)(Mn—Mn)"],
];
for (const [label, smiles, want] of [...SAM, ...OTHERS]) assert.equal(nameOf(smiles), want, label);
console.log(`namer-complex.check: ${SAM.length} of Sam's complexes and ${OTHERS.length} others named as IR-9 names them`);

// Structure to Name as the editor runs it (Editor.tsx nameFor): the namer's name read back by OPSIN first, then
// Octet's own names, then a complex's name.
const { checkedName, setComplexNamer, setNamer } = await import("./naming.ts");
const { iupacName } = await import("./namer.ts");
setNamer(iupacName);
setComplexNamer((m) => complexName(m, api));
const inchiOf = (s: Mol | string) => { try { return chem.toInchi(typeof s === "string" ? chem.parseStructure(s) : s); } catch { return undefined; } };
const editorName = (smiles: string) => { const d = drawn(smiles); return checkedName(d, d, nameToSmiles, inchiOf, chem.cipOf); };
assert.equal(editorName(OTHERS[1][1]), OTHERS[1][2]);
assert.equal(editorName("O=C=[Fe](=C=O)(=C=O)(=C=O)=C=O"), "pentacarbonyliron"); // the namer's, read back by OPSIN
assert.equal(editorName("CCO"), "ethanol");

// Names one term away from right: the check must turn each down.
const wrong: [string, string[]][] = [
  ["C12C3=CC=CC=N3[Ru+2]34(N5=CC=CC=C5C5N3=CC=CC=5)(N=1C=CC=C2)N1=C(C2C=CC=CN=24)C=CC=C1", [
    "tris(2,2'-bipyridine-κ2N1,N1')ruthenium(3+)", "bis(2,2'-bipyridine-κ2N1,N1')ruthenium(2+)", "tris(2,2'-bipyridine-κN1)ruthenium(2+)",
    "tris(2,2'-bipyridine-κ2N1,N1')osmium(2+)", "tris(4,4'-bipyridine-κ2N1,N1')ruthenium(2+)", "tris(2,2'-bipyridine-κ2N1,N1')ruthenium(II)",
    "tris(2,2'-bipyridine-κ2N1,N3')ruthenium(2+)", "tris(2,2'-bipyridine)ruthenium(2+)", "tris(2,2'-bipyridine-κ2N1,N1')ruthenate(2+)",
    "tris(2,2'-bipyridine-κ2N1,N1')ruthenium",
  ]],
  ["Cl[Rh](P(c1ccccc1)(c1ccccc1)c1ccccc1)(P(c1ccccc1)(c1ccccc1)c1ccccc1)P(c1ccccc1)(c1ccccc1)c1ccccc1", [
    "chloridotris(triphenylphosphane)rhodium(III)", "chloridobis(triphenylphosphane)rhodium(I)", "bromidotris(triphenylphosphane)rhodium(I)",
    "dichloridotris(triphenylphosphane)rhodium(I)", "chloridotris(triphenylphosphane)dirhodium(I)",
  ]],
  ["[K+].[K+].[K+].N#C[Fe-3](C#N)(C#N)(C#N)(C#N)C#N", [
    "potassium hexacyanidoferrate(4-)", "sodium hexacyanidoferrate(3-)", "potassium pentacyanidoferrate(3-)", "potassium hexacyanidoiron(3-)",
    "hexacyanidoferrate(3-) potassium",
  ]],
  ["CC1=CC(C)=O[Fe]23(O1)(OC(C)=CC(C)=O2)OC(C)=CC(C)=O3", ["tris(4-oxopent-2-en-2-olato-κO)iron(III)", "tris(4-oxopent-2-en-2-olato-κ2O,O')iron(II)"]],
  ["[Rh]%10%13%14(OC(C)=O%11)OC(C)=O%12.[Rh]%10%11%12(OC(C)=O%13)OC(C)=O%14", [
    "tetrakis(μ-acetato-κO:κO')dirhodium", "tetrakis(μ-acetato-κ2O,O')dirhodium(Rh—Rh)", "tetrakis(acetato-κO)dirhodium(Rh—Rh)",
    "tris(μ-acetato-κO:κO')dirhodium(Rh—Rh)",
  ]],
  ["[Rh]%10%13%14(=C(C(=O)OC)c1ccccc1)(OC(C)=O%11)OC(C)=O%12.[Rh]%10%11%12(OC(C)=O%13)OC(C)=O%14", [
    // The carbene's Rh is 1 by the numbering rule, so -2κC is turned down although it reads as the same structure.
    "tetrakis(μ-acetato-1κO:2κO')(2-methoxy-2-oxo-1-phenylethylidene-2κC)dirhodium(Rh—Rh)",
    "tetrakis(μ-acetato-κO:κO')(2-methoxy-2-oxo-1-phenylethylidene)dirhodium(Rh—Rh)",
  ]],
  ["C12=N([Os]345(N6C(C7N3=C(C3C=CC=CN=34)C=CC=7)=CC=CC=6)N3=C1C=CC=C3C1N5=CC=CC=1)C=CC=C2", [
    "bis(2,2':6',2''-terpyridine-κ2N1,N1')osmium(0)", "bis(2,2':6',2''-terpyridine-κ3N1,N1',N1'')osmium(II)",
  ]],
  ["C12=N([Os]345(N6C(C7N3=C(C3N=CC=CN=34)C=C(C3C=CC(OC)=CC=3)C=7)=NC=CC=6)N3=C1C=C(C1C=CC(OC)=CC=1)C=C3C1N5=CC=CN=1)C=CC=N2", [
    "bis{2-[4-(4-methoxyphenyl)-6-(pyrimidin-2-yl)pyridin-2-yl-κN1]pyrimidine-κN1}osmium(0)",
    "bis{2-[4-(4-methoxyphenyl)-6-(pyrimidin-2-yl-κN1)pyridin-2-yl]pyrimidine-κN1}osmium(0)",
    "bis{2-[4-(4-methoxyphenyl-κO)-6-(pyrimidin-2-yl-κN1)pyridin-2-yl]pyrimidine-κN1}osmium(0)",
  ]],
  ["[NH3][Pt]1(OC(=O)C2(CCC2)C(=O)O1)[NH3]", ["diammine(cyclobutane-1,1-dicarboxylato-κ2O,O')platinum(II)", "diammine(cyclobutane-1,1-dicarboxylato-κO)platinum(II)"]],
  [ESP, ["bis[μ-3,3'-(1,3-phenylene)bis(2,2-dimethylpropanoato-κ2O,O')]dirhodium(Rh—Rh)", "bis[μ-3,3'-(1,3-phenylene)bis(2,2-dimethylpropanoato-κO)]dirhodium(Rh—Rh)"]],
  ["[Na+].[Co-]%11%12%13%14%15[N](CC(=O)O%11)(CC(=O)O%12)CC[N]%15(CC(=O)O%13)CC(=O)O%14", [
    "sodium ({{2-[bis(carboxylatomethyl-κO)amino-κN]ethyl}(carboxylatomethyl)amino-κN}acetato-κO)cobaltate(1-)",
    "sodium ({{2-[bis(carboxylatomethyl-κO)amino]ethyl}(carboxylatomethyl-κO)amino-κN}acetato-κO)cobaltate(1-)",
    "sodium ({{2-[bis(carboxylatomethyl-κO)amino-κN]ethyl}(carboxylatomethyl-κO)amino-κN}acetato-κO)cobaltate(2-)",
  ]],
];
let turned = 0;
for (const [smiles, names] of wrong) {
  const m = drawn(smiles);
  for (const name of names) { assert.equal(complexNameReads(name, m, api), false, name); turned++; }
}
// And the right names read back as right.
for (const [, smiles, want] of [...SAM, ...OTHERS]) assert.ok(complexNameReads(want, drawn(smiles), api), want);
console.log(`namer-complex.check: ${turned} names one term away from right turned down`);

// No name for these: η ligands, three metal atoms, two complexes in one drawing, a complex with a solvent molecule.
const none: [string, string][] = [
  ["η2 ethene", "C1=C[Pt]1(Cl)(Cl)Cl"],
  ["Os3(CO)12", "O=C=[Os]1(=C=O)(=C=O)(=C=O)[Os](=C=O)(=C=O)(=C=O)(=C=O)[Os]1(=C=O)(=C=O)(=C=O)=C=O"],
  ["[Pt(NH3)4][PtCl4]", "[NH3][Pt+2]([NH3])([NH3])[NH3].Cl[Pt-2](Cl)(Cl)Cl"],
  ["with solvent", "[NH3][Pt](Cl)(Cl)[NH3].CS(C)=O"],
];
for (const [label, smiles] of none) assert.equal(nameOf(smiles), undefined, label);
// Sam's Os labelled "Os(II)": the label is not read as Os with an I-I group (labels.ts), so there is no name.
const phen = chem.parseStructure(SAM.find((x) => x[0] === "Os(phen)3")![1]);
const labelled = { ...phen, atoms: phen.atoms.map((a) => (a.label === "Os" ? { ...a, text: "Os(II)" } : a)) };
assert.equal(complexName(chem.expandLabels(labelled), api), undefined, "Os(II) label");
console.log(`namer-complex.check: ${none.length} structures with no name, as expected`);

// Speed: a complex of about 100 atoms, named with every check in under 50 ms once OPSIN and Indigo are warm (Ru
// with three 4,4'-dialkyl-2,2'-bipyridines; each new to the namer, so nothing is kept from an earlier name).
const bpy = (a: number, b: number, r: string) => `C1(${r})=CC=[N]%${a}C(=C1)C1=[N]%${b}C=CC(${r})=C1`;
const ru = (n: number) => `[Ru+2]%10%11%12%13%14%15.${bpy(10, 11, "C".repeat(n))}.${bpy(12, 13, "C".repeat(n))}.${bpy(14, 15, "C".repeat(n))}`;
nameOf(ru(4));
const times = [9, 10, 11].map((n) => {
  const m = drawn(ru(n)), t = performance.now(), name = complexName(m, api), dt = performance.now() - t;
  assert.ok(name?.startsWith(`tris(4,4'-di`), name);
  return { atoms: m.atoms.filter((a) => a.label !== "H").length, dt };
});
const best = Math.min(...times.map((x) => x.dt));
assert.ok(best < 50, `a complex of ${times[2].atoms} atoms took ${best.toFixed(1)} ms`);
console.log(`namer-complex.check: a complex of ${times[2].atoms} atoms named in ${best.toFixed(1)} ms`);
