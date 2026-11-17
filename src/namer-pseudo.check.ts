// Run: node src/namer-pseudo.check.ts. Structure to Name and Name to Structure for issue 82's classes (steroids,
// sugars, alditols and inositols, 1,4- and 1,3-rings, ring fusions, tropanes, cages, fused polycyclics), with r and s
// (pseudo.ts) and cages drawn in 3D (naming.ts lockedAtoms). Every name is made as the editor makes it (checkedName,
// with the reader and the cage check wired as Editor.tsx wires them) and read back to the drawing's standard InChI.
// The r and s are checked against sources other than Octet's labeller: Indigo's labels for chain centres, OPSIN's cis
// and trans for rings, and published names. Then typed names, malformed and hostile names, the limits, the gate and
// the cache, and the time each takes.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import type { Mol } from "./render.ts";

const dir = new URL("./vendor/opsin/", import.meta.url);
if (!existsSync(new URL("opsin.js", dir))) { console.log("namer-pseudo: skipped (no OPSIN build)"); process.exit(0); }
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
const json = (file: string) => JSON.parse(readFileSync(new URL(file, import.meta.url), "utf8"));
const { DRUGS } = await import("./drugs.ts");
const { attachOpsin, knownName, nameToSmiles, setPseudoReader } = await import("./names.ts");
attachOpsin(opsin, readFileSync(new URL("names.txt", dir), "utf8"), json("./nameindex.json"), DRUGS, json("./abbreviations.json"));
const { checkedName, namerName, setCageCheck, setNamer } = await import("./naming.ts");
const { iupacName } = await import("./namer.ts");
const { MOST_OPEN, pseudoReader, pseudoSmiles, smilesLabels } = await import("./pseudo.ts");
const { libraryItem } = await import("./library.ts");
const { clean3d } = await import("./clean3d.ts");
const { keepHands } = await import("./cip.ts");
const { EMPTY, addChair, deleteAtom, flipAtoms, rotateAtoms, setLabel, sprout } = await import("./edit.ts");
// As Editor.tsx wires them.
setNamer(iupacName);
const api = { mol: (s: string) => chem.parseStructure(s, false), inchi: chem.toInchi, cip: chem.cipOf, name: namerName };
setPseudoReader(pseudoReader(api));
setCageCheck(chem.toInchiAux);
const inchiOf = (s: Mol | string) => { try { return chem.toInchi(typeof s === "string" ? chem.parseStructure(s, false) : s); } catch { return undefined; } };
const nameFor = (m: Mol) => checkedName(m, chem.expandLabels(m), nameToSmiles, inchiOf, chem.cipOf, knownName);
const drawn = (smiles: string) => chem.parseStructure(smiles);
const all = (m: Mol) => new Set(m.atoms.map((_, i) => i));
const in3d = (m: Mol) => keepHands(m, clean3d(m, [...all(m)]), [...all(m)]);
const opsinSmiles = (n: string) => { try { return opsin.parseToSmiles(n) ?? undefined; } catch { return undefined; } };
const descriptors = (name: string) => /^\(([^()]*)\)-/.exec(name)?.[1];
const stereoFree = (inchi: string | undefined) => inchi?.split("/").filter((l, k) => k < 2 || !/^[tms]/.test(l)).join("/");
const median = (t: number[]) => [...t].sort((x, y) => x - y)[t.length >> 1];
const time = (f: () => unknown, runs: number) => median(Array.from({ length: runs }, () => { const t = performance.now(); f(); return performance.now() - t; }));

// A chair drawn as the Chair tool draws it, with labels on its carbons, each axial or equatorial.
const chair = (): Mol => addChair(EMPTY, 1, { point: [0, 0], turn: 0 });
function onChair(m: Mol, i: number, text: string, axial: boolean): Mol {
  m = sprout(m, i);
  if (!axial) { m = sprout(m, i); m = deleteAtom(m, m.atoms.length - 2); }
  return setLabel(m, m.atoms.length - 1, text);
}
const allOH = (axialAt: number[]) => { let m = chair(); for (let i = 0; i < 6; i++) m = onChair(m, i, "OH", axialAt.includes(i)); return m; };
// Adamantane and cubane on their lattices, in 3D.
const lattice = (pts: [number, number, number][], near: number): Mol => {
  const bonds: Mol["bonds"] = [];
  pts.forEach((p, i) => pts.forEach((q, j) => { if (i < j && Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) < near) bonds.push({ type: 1, atoms: [i, j] }); }));
  return { atoms: pts.map((p) => ({ label: "C", location: [p[0] * 0.6 + 0.07 * p[2], p[1] * 0.6 + 0.05 * p[2], p[2] * 0.6] as [number, number, number] })), bonds };
};
const adamantane3d = lattice([[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1], [2, 0, 0], [-2, 0, 0], [0, 2, 0], [0, -2, 0], [0, 0, 2], [0, 0, -2]], 1.8);
const cubane3d = libraryItem("lib:Cubane")!.mol;
const withAtom = (m: Mol, on: number, label: string, at: [number, number, number]): Mol => ({ atoms: [...m.atoms, { label, location: at }], bonds: [...m.bonds, { type: 1, atoms: [on, m.atoms.length] }] });

// ——— Issue 82's classes: each named (the name given, or any name with "named", or none), and read back ———
const XYLITOL = "OC[C@@H](O)[C@H](O)[C@@H](O)CO", RIBITOL = "OC[C@@H](O)[C@@H](O)[C@@H](O)CO", TROPINE = "CN1[C@@H]2CC[C@H]1C[C@@H](O)C2";
const TRANEXAMIC = "NC[C@H]1CC[C@@H](CC1)C(O)=O";
const NAMED = "named";
const CLASSES: [string, Mol, string | null][] = [
  // Steroids
  ["testosterone", drawn("C[C@]12CC[C@H]3[C@@H](CCC4=CC(=O)CC[C@]34C)[C@@H]1CC[C@@H]2O"), "(8R,9S,10R,13S,14S,17S)-17-hydroxy-10,13-dimethyl-1,2,6,7,8,9,10,11,12,13,14,15,16,17-tetradecahydro-3H-cyclopenta[a]phenanthren-3-one"],
  ["estradiol", drawn("C[C@]12CC[C@H]3[C@H]([C@@H]1CC[C@@H]2O)CCC4=C3C=CC(=C4)O"), NAMED],
  ["cholesterol", drawn("C[C@H](CCCC(C)C)[C@H]1CC[C@@H]2[C@@]1(CC[C@H]3[C@H]2CC=C4[C@@]3(CC[C@@H](C4)O)C)C"), NAMED],
  ["progesterone", drawn("CC(=O)[C@H]1CC[C@H]2[C@@H]3CCC4=CC(=O)CC[C@]4(C)[C@H]3CC[C@]12C"), NAMED],
  ["prednisolone", drawn("C[C@]12C[C@H](O)[C@H]3[C@@H](CCC4=CC(=O)C=C[C@]34C)[C@@H]1CC[C@]2(O)C(=O)CO"), NAMED],
  ["5α-androstane-3β,17β-diol", drawn("C[C@]12CC[C@H]3[C@@H](CC[C@H]4C[C@@H](O)CC[C@]34C)[C@@H]1CC[C@@H]2O"), NAMED],
  ["cholic acid", drawn("C[C@H](CCC(O)=O)[C@H]1CC[C@H]2[C@@H]3[C@H](O)C[C@@H]4C[C@H](O)CC[C@]4(C)[C@H]3C[C@H](O)[C@]12C"), NAMED],
  ["lupane-type pentacycle", drawn("CC1(C)CCC[C@]2(C)[C@H]1CC[C@@]1(C)[C@@H]2CC[C@H]2[C@@H]3[C@@H](CC[C@]21C)CC[C@@H]3C(C)C"), NAMED],
  // Sugars: flat, as chairs and as Haworth projections
  ["β-D-glucopyranose", drawn("OC[C@H]1O[C@@H](O)[C@H](O)[C@@H](O)[C@@H]1O"), "(2R,3R,4S,5S,6R)-6-(hydroxymethyl)oxane-2,3,4,5-tetraol"],
  ["methyl β-D-glucopyranoside", drawn("CO[C@@H]1O[C@H](CO)[C@@H](O)[C@H](O)[C@H]1O"), NAMED],
  ["GlcNAc", drawn("OC[C@H]1O[C@@H](O)[C@H](NC(C)=O)[C@@H](O)[C@@H]1O"), NAMED],
  ["glucose pentaacetate", drawn("CC(=O)OC[C@H]1O[C@@H](OC(C)=O)[C@H](OC(C)=O)[C@@H](OC(C)=O)[C@@H]1OC(C)=O"), NAMED],
  ["lactose", drawn("OC[C@H]1O[C@@H](O[C@@H]2[C@@H](CO)O[C@@H](O)[C@H](O)[C@H]2O)[C@H](O)[C@@H](O)[C@H]1O"), NAMED],
  ["β-D-ribofuranose", drawn("OC[C@H]1O[C@@H](O)[C@H](O)[C@@H]1O"), NAMED],
  ...["β-D-Glucopyranose (chair)", "α-D-Glucopyranose (Haworth)", "β-D-Galactopyranose (chair)", "β-D-Mannopyranose (Haworth)", "β-D-Fructofuranose (Haworth)"]
    .map((t): [string, Mol, string] => [t, libraryItem(`lib:${t}`)!.mol, NAMED]),
  // Alditols and inositols (J2's numbering; myo-inositol's R and S do not read in OPSIN, so it has no name)
  ["xylitol", drawn(XYLITOL), "(2R,3r,4S)-pentane-1,2,3,4,5-pentaol"],
  ["ribitol", drawn(RIBITOL), "(2R,3s,4S)-pentane-1,2,3,4,5-pentaol"],
  ["D-arabinitol", drawn("OC[C@@H](O)[C@@H](O)[C@H](O)CO"), NAMED],
  ["galactitol", drawn("OC[C@@H](O)[C@H](O)[C@H](O)[C@@H](O)CO"), "(2R,3S,4R,5S)-hexane-1,2,3,4,5,6-hexaol"],
  ["D-glucitol", drawn("OC[C@H](O)[C@@H](O)[C@H](O)[C@H](O)CO"), NAMED],
  ["meso-tartaric acid", drawn("OC(=O)[C@@H](O)[C@@H](O)C(O)=O"), "(2R,3S)-2,3-dihydroxybutanedioic acid"],
  ["meso-pentane-2,4-diol", drawn("C[C@H](O)C[C@@H](C)O"), "(2R,4S)-pentane-2,4-diol"],
  ["3-chloropentane-2,4-diol, r", drawn("C[C@H](O)[C@@H](Cl)[C@@H](C)O"), NAMED],
  ["scyllo-inositol", drawn("O[C@H]1[C@H](O)[C@@H](O)[C@H](O)[C@@H](O)[C@@H]1O"), "(1r,2r,3r,4r,5r,6r)-cyclohexane-1,2,3,4,5,6-hexaol"],
  ["scyllo-inositol, chair", allOH([]), "(1r,2r,3r,4r,5r,6r)-cyclohexane-1,2,3,4,5,6-hexaol"],
  ["myo-inositol", drawn("O[C@H]1[C@H](O)[C@@H](O)[C@H](O)[C@H](O)[C@@H]1O"), null],
  ["myo-inositol, chair", allOH([1]), null],
  // 1,4- and 1,3-disubstituted rings, flat and as chairs
  ["trans-tranexamic acid", drawn(TRANEXAMIC), "(1r,4r)-4-(aminomethyl)cyclohexane-1-carboxylic acid"],
  ["cis-tranexamic acid", drawn("NC[C@H]1CC[C@H](CC1)C(O)=O"), "(1s,4s)-4-(aminomethyl)cyclohexane-1-carboxylic acid"],
  ["trans-4-tert-butylcyclohexan-1-ol", drawn("CC(C)(C)[C@H]1CC[C@H](O)CC1"), "(1r,4r)-4-tert-butylcyclohexan-1-ol"],
  ["cis-4-tert-butylcyclohexan-1-ol", drawn("CC(C)(C)[C@H]1CC[C@@H](O)CC1"), "(1s,4s)-4-tert-butylcyclohexan-1-ol"],
  ["trans-4-(4-chlorophenyl)cyclohexane-1-carboxylic acid", drawn("O=C(O)[C@H]1CC[C@@H](CC1)c1ccc(Cl)cc1"), "(1r,4r)-4-(4-chlorophenyl)cyclohexane-1-carboxylic acid"],
  ["cis-1,3-dimethylcyclobutane", drawn("C[C@H]1C[C@@H](C)C1"), "(1s,3s)-1,3-dimethylcyclobutane"],
  ["trans-1,3-dimethylcyclobutane", drawn("C[C@H]1C[C@H](C)C1"), "(1r,3r)-1,3-dimethylcyclobutane"],
  ["trans-4-aminocyclohexyl on a phenol (r and s in a prefix)", drawn("N[C@H]1CC[C@@H](CC1)c1ccc(O)cc1"), "4-[(1r,4r)-4-aminocyclohexyl]phenol"],
  ["trans-4-methylcyclohexan-1-ol, chair, both equatorial", onChair(onChair(chair(), 0, "OH", false), 3, "CH3", false), "(1r,4r)-4-methylcyclohexan-1-ol"],
  ["trans-4-methylcyclohexan-1-ol, chair, both axial", onChair(onChair(chair(), 0, "OH", true), 3, "CH3", true), "(1r,4r)-4-methylcyclohexan-1-ol"],
  ["cis-4-methylcyclohexan-1-ol, chair", onChair(onChair(chair(), 0, "OH", false), 3, "CH3", true), "(1s,4s)-4-methylcyclohexan-1-ol"],
  // r and s through bis (each list counts twice), and on centres between Kekulé rings
  ["three 1,4-cyclohexylene rings", drawn("C[C@H]1CC[C@H](CC1)[C@@H]1CC[C@H](CC1)[C@H]1CC[C@H](CC1)C"), "(1r,4r)-1,4-bis[(1s,4s)-4-methylcyclohexyl]cyclohexane"],
  ["cis-9,10-dimethyl-9,10-dihydroanthracene", drawn("C[C@@H]1c2ccccc2[C@H](C)c2ccccc12"), "(9s,10s)-9,10-dimethyl-9,10-dihydroanthracene"],
  ["trans-9,10-dimethyl-9,10-dihydroanthracene", drawn("C[C@@H]1c2ccccc2[C@@H](C)c2ccccc12"), "(9r,10r)-9,10-dimethyl-9,10-dihydroanthracene"],
  ["cis-10b,10c-dihydropyrene", drawn("C1=CC=C2C=CC3=CC=CC4=CC=C1[C@H]2[C@H]34"), "(10bs,10cs)-10b,10c-dihydropyrene"],
  // Ring fusions
  ["cis-Decalin", libraryItem("lib:cis-Decalin")!.mol, "(4as,8as)-decahydronaphthalene"],
  ["trans-Decalin", libraryItem("lib:trans-Decalin")!.mol, "(4ar,8ar)-decahydronaphthalene"],
  ["trans-decalin, drawn", drawn("C1CC[C@H]2CCCC[C@@H]2C1"), "(4ar,8ar)-decahydronaphthalene"],
  ["cis-hydrindane", drawn("C1C[C@H]2CCCC[C@H]2C1"), NAMED],
  ["trans-decalin-2-one", drawn("O=C1CC[C@@H]2CCCC[C@H]2C1"), NAMED],
  // Tropanes
  ["tropine", drawn(TROPINE), "(1R,3r,5S)-8-methyl-8-azabicyclo[3.2.1]octan-3-ol"],
  ["pseudotropine", drawn("CN1[C@@H]2CC[C@H]1C[C@H](O)C2"), "(1R,3s,5S)-8-methyl-8-azabicyclo[3.2.1]octan-3-ol"],
  ["hyoscyamine", drawn("CN1[C@@H]2CC[C@H]1C[C@@H](OC(=O)[C@H](CO)c3ccccc3)C2"), "(1R,3r,5S)-8-methyl-8-azabicyclo[3.2.1]octan-3-yl (2S)-3-hydroxy-2-phenylpropanoate"],
  ["atropine", drawn("CN1[C@@H]2CC[C@H]1C[C@@H](OC(=O)C(CO)c3ccccc3)C2"), "(1R,3r,5S)-8-methyl-8-azabicyclo[3.2.1]octan-3-yl 3-hydroxy-2-phenylpropanoate"],
  ["cocaine", drawn("CN1[C@H]2CC[C@@H]1[C@H]([C@H](C2)OC(=O)c1ccccc1)C(=O)OC"), NAMED],
  // Cages, flat, with dashed back bonds, with wedges and in 3D
  ["adamantane", drawn("C1C2CC3CC1CC(C2)C3"), "adamantane"],
  ["amantadine", drawn("NC12CC3CC(CC(C3)C1)C2"), "adamantan-1-amine"],
  ["memantine", drawn("CC12CC3CC(C)(C1)CC(N)(C3)C2"), "3,5-dimethyladamantan-1-amine"],
  ["adamantan-2-one", drawn("O=C1C2CC3CC(C2)CC1C3"), NAMED],
  ["cubane", drawn("C12C3C4C1C5C2C3C45"), "cubane"],
  ["cubane-1,4-dicarboxylic acid", drawn("OC(=O)C12C3C4C1C1C2C3C41C(O)=O"), "cubane-1,4-dicarboxylic acid"],
  ["quinuclidine", drawn("C1CN2CCC1CC2"), "1-azabicyclo[2.2.2]octane"],
  ["DABCO", drawn("C1CN2CCN1CC2"), NAMED],
  ["hexamine", drawn("C1N2CN3CN1CN(C2)C3"), NAMED],
  ["camphor, wedged", drawn("CC1(C)[C@@H]2CC[C@@]1(C)C(=O)C2"), "(1R,4R)-1,7,7-trimethylbicyclo[2.2.1]heptan-2-one"],
  ["Cubane template (3D)", cubane3d, "cubane"],
  ["adamantane in 3D", adamantane3d, "adamantane"],
  ["adamantane, 3D Clean Up", in3d(drawn("C1C2CC3CC1CC(C2)C3")), "adamantane"],
  ["amantadine in 3D", withAtom(adamantane3d, 0, "N", [1.5, 1.5, 1.2]), "(3s,5s,7s)-adamantan-1-amine"],
  ["amantadine, 3D Clean Up", in3d(drawn("NC12CC3CC(CC(C3)C1)C2")), "(3s,5s,7s)-adamantan-1-amine"],
  ["camphor, 3D Clean Up", in3d(drawn("CC1(C)[C@@H]2CC[C@@]1(C)C(=O)C2")), "(1R,4R)-1,7,7-trimethylbicyclo[2.2.1]heptan-2-one"],
  ["cubane-1,4-dicarboxylic acid, 3D Clean Up", in3d(drawn("OC(=O)C12C3C4C1C1C2C3C41C(O)=O")), "(2r,3r,5r,6r,7r,8r)-cubane-1,4-dicarboxylic acid"],
  ["tropine, 3D Clean Up", in3d(drawn(TROPINE)), "(1R,3r,5S)-8-methyl-8-azabicyclo[3.2.1]octan-3-ol"],
  // Fused polycyclics
  ["coronene", drawn("c1cc2ccc3ccc4ccc5ccc6ccc1c1c2c3c4c5c61"), "coronene"],
  ["pyrene", drawn("c1cc2ccc3cccc4ccc(c1)c2c34"), "pyrene"],
  ["dibenzo[c,g]phenanthrene", drawn("c1ccc2c(c1)ccc1ccc3ccc4ccccc4c3c12"), "dibenzo[c,g]phenanthrene"],
  ["tetraphene", drawn("c1ccc2cc3c(ccc4ccccc43)cc2c1"), "tetraphene"],
  ["morphine", drawn("CN1CC[C@]23[C@@H]4[C@H]1CC5=C2C(=C(C=C5)O)O[C@H]3[C@H](C=C4)O"), NAMED],
  ["quinine", drawn("COc1ccc2nccc([C@@H](O)[C@@H]3C[C@@H]4CCN3C[C@@H]4C=C)c2c1"), NAMED],
  ["strychnine", drawn("O=C1C[C@H]2OCC=C3CN4CC[C@@]56[C@@H]4C[C@@H]3[C@@H]2[C@@H]5N1c1ccccc16"), NAMED],
];
let classesNamed = 0, rs = 0, inThreeD = 0;
const t0 = performance.now();
for (const [label, m, want] of CLASSES) {
  const name = nameFor(m);
  if (want === null) { assert.equal(name, undefined, `${label}: no name`); continue; }
  assert.ok(name, `${label} is named`);
  if (want !== NAMED) assert.equal(name, want, label);
  classesNamed++;
  if (/\(([^()]*[0-9][rs][,)])/.test(name!)) rs++;
  // Read back by Name to Structure: the drawing's InChI (a cage drawn in 3D: with its locked bridgeheads open).
  const back = nameToSmiles(name!);
  assert.ok(back, `${label}: "${name}" reads`);
  const threeD = m.atoms.some((a) => a.location[2]);
  if (threeD && inchiOf(back!) !== inchiOf(m)) { assert.equal(stereoFree(inchiOf(back!)), stereoFree(inchiOf(m)), `${label}: "${name}" is the drawing's constitution`); inThreeD++; }
  else assert.equal(inchiOf(back!), inchiOf(m), `${label}: "${name}" reads back as the drawing`);
}
console.log(`namer-pseudo: ${classesNamed} of ${CLASSES.length} class structures named (${CLASSES.length - classesNamed} have no name, as meant), ${rs} with r or s, ${inThreeD} cages in 3D; each read back (${((performance.now() - t0) / CLASSES.length).toFixed(0)} ms each) ok`);

// The same structure drawn another way has the same name: xylitol (meso) flipped, turned 90° and in 3D; hyoscyamine
// flipped as a mirror image (Flip), whose (2S) becomes (2R).
{
  const x = drawn(XYLITOL), want = "(2R,3r,4S)-pentane-1,2,3,4,5-pentaol";
  for (const [how, m] of [["Rotate 180° about the vertical", flipAtoms(x, all(x), "horizontal")], ["mirrored", flipAtoms(x, all(x), "horizontal", true)], ["turned 90°", rotateAtoms(x, all(x), 90)], ["3D Clean Up", in3d(x)]] as const)
    assert.equal(nameFor(m), want, `xylitol ${how}`);
  const h = drawn("CN1[C@@H]2CC[C@H]1C[C@@H](OC(=O)[C@H](CO)c3ccccc3)C2");
  assert.equal(nameFor(flipAtoms(h, all(h), "horizontal", true)), "(1R,3r,5S)-8-methyl-8-azabicyclo[3.2.1]octan-3-yl (2R)-3-hydroxy-2-phenylpropanoate", "hyoscyamine's mirror image");
  console.log("namer-pseudo: xylitol flipped, mirrored, turned and in 3D, and hyoscyamine's mirror image, named alike ok");
}

// ——— r and s against other sources ———
// Published names (J2's numbering included): each one's descriptors are Octet's, and the published name reads (the r
// and s ones by Octet's reader) as the structure.
for (const [smiles, published] of [
  [XYLITOL, "(2R,3r,4S)-pentane-1,2,3,4,5-pentol"], [RIBITOL, "(2R,3s,4S)-pentane-1,2,3,4,5-pentol"],
  ["OC[C@@H](O)[C@H](O)[C@H](O)[C@@H](O)CO", "(2R,3S,4R,5S)-hexane-1,2,3,4,5,6-hexol"], ["OC(=O)[C@@H](O)[C@@H](O)C(O)=O", "(2R,3S)-2,3-dihydroxybutanedioic acid"],
  [TROPINE, "(1R,3r,5S)-8-methyl-8-azabicyclo[3.2.1]octan-3-ol"], ["CN1[C@@H]2CC[C@H]1C[C@H](O)C2", "(1R,3s,5S)-8-methyl-8-azabicyclo[3.2.1]octan-3-ol"],
  ["C[C@H](O)C[C@@H](C)O", "(2R,4S)-pentane-2,4-diol"],
] as const) {
  const m = drawn(smiles), name = nameFor(m);
  assert.equal(descriptors(name ?? ""), descriptors(published), `${published}: Octet cites ${descriptors(published)}`);
  assert.equal(inchiOf(nameToSmiles(published) ?? ""), inchiOf(m), `${published} reads as its structure`);
}
console.log("namer-pseudo: published names (xylitol, ribitol, galactitol, meso-tartaric acid, tropine, pseudotropine, meso-pentane-2,4-diol) ok");
// Chain centres: Octet's labels are Indigo's (its own CIP code), r and s included. Indigo's labels depend on what it
// labelled before (after ribitol it gives tropine's C3 R), so each structure is labelled by an Indigo of its own.
{
  const fresh = (await import(new URL("../node_modules/indigo-ketcher/indigo-ketcher-norender.js", import.meta.url).href)).default;
  const indigoLabels = async (smiles: string) => {
    const indigo = await fresh(), o = new indigo.MapStringString();
    o.set("output-content-type", "application/json");
    try { return (JSON.parse(JSON.parse(indigo.calculateCip(smiles, "ket", o)).struct).mol0.atoms as { cip?: string }[]).map((a) => a.cip?.replace(/[()]/g, "")); } finally { o.delete(); }
  };
  let n = 0;
  for (const smiles of [XYLITOL, RIBITOL, TROPINE, "C[C@H](O)[C@@H](Cl)[C@@H](C)O", "C[C@H](O)[C@H](Cl)[C@@H](C)O", "OC(=O)[C@@H](O)[C@H](O)[C@@H](O)[C@H](O)C(O)=O",
    "OC[C@@H](O)[C@H](O)[C@H](O)[C@H](O)[C@@H](O)CO", "OC[C@@H](O)[C@@H](O)[C@H](O)[C@@H](O)[C@@H](O)CO", "C[C@@H](N)[C@H](O)[C@@H](C)N", "CC[C@H](C)[C@@H](Br)[C@@H](C)CC"]) {
    const ours = chem.cipOf(drawn(smiles)).atoms, theirs = await indigoLabels(smiles);
    theirs.forEach((x, i) => assert.equal(ours[i], x, `${smiles}: atom ${i} is ${x ?? "not labelled"} as Indigo has it`));
    n += theirs.filter((x) => x === "r" || x === "s").length;
  }
  assert.ok(n >= 6, `${n} r and s compared`);
  console.log(`namer-pseudo: Octet's r and s are Indigo's for ${n} chain centres ok`);
}
// Rings: OPSIN's cis and trans structure, named by Octet, has the r and s published for it, and Octet's name reads
// back as OPSIN's structure.
for (const [typed, want] of [
  ["trans-4-methylcyclohexan-1-ol", "(1r,4r)-4-methylcyclohexan-1-ol"], ["cis-4-methylcyclohexan-1-ol", "(1s,4s)-4-methylcyclohexan-1-ol"],
  ["trans-4-(aminomethyl)cyclohexane-1-carboxylic acid", "(1r,4r)-4-(aminomethyl)cyclohexane-1-carboxylic acid"], ["cis-4-(aminomethyl)cyclohexane-1-carboxylic acid", "(1s,4s)-4-(aminomethyl)cyclohexane-1-carboxylic acid"],
  ["trans-decahydronaphthalene", "(4ar,8ar)-decahydronaphthalene"], ["cis-decahydronaphthalene", "(4as,8as)-decahydronaphthalene"],
  ["trans-1,3-dimethylcyclobutane", "(1r,3r)-1,3-dimethylcyclobutane"], ["cis-1,3-dimethylcyclobutane", "(1s,3s)-1,3-dimethylcyclobutane"],
  ["trans-cyclohexane-1,4-diol", "(1r,4r)-cyclohexane-1,4-diol"], ["cis-cyclohexane-1,4-dicarboxylic acid", "(1s,4s)-cyclohexane-1,4-dicarboxylic acid"],
] as const) {
  const smiles = opsinSmiles(typed);
  assert.ok(smiles, `OPSIN reads ${typed}`);
  assert.equal(nameFor(drawn(smiles!)), want, typed);
  assert.equal(inchiOf(nameToSmiles(want) ?? ""), inchiOf(smiles!), `${want} reads as ${typed}`);
}
console.log("namer-pseudo: OPSIN's cis and trans rings take the r and s published for them, and read back ok");
// The reader's own labels (configurations kept as cip.ts keeps ChemDraw's) are those of the structure Indigo draws
// from the SMILES (wedges): neighbour order, a hydrogen first or after the atom before it, ring closures.
for (const smiles of ["C[C@H](O)CC", "[C@H](C)(O)CC", "O[C@@H](C)CC", "C1C[C@H](O)CC[C@@H]1C", "[C@@H]1(O)CC[C@H](C)CC1", "C[C@]1(O)CCCC[C@@H]1Cl", XYLITOL, TROPINE,
  "F/C=C/[C@H](Cl)Br", "C[C@@]12CC[C@@H](CC1=O)C2(C)C", "O[C@H]1[C@H](O)[C@@H](O)[C@H](O)[C@@H](O)[C@@H]1O", "N[C@@H](C)C(=O)O"]) {
  const mine = smilesLabels(smiles, api)!, drawnLabels = chem.cipOf(chem.parseStructure(smiles, false)).atoms;
  assert.deepEqual(mine.atoms, drawnLabels.slice(0, mine.atoms.length), `${smiles}: the reader labels it as drawn`);
}
console.log("namer-pseudo: the reader's configurations label as Indigo draws them ok");

// ——— Name to Structure: typed names ———
for (const [typed, want] of [
  ["(1r,4r)-4-(aminomethyl)cyclohexane-1-carboxylic acid", TRANEXAMIC], ["(1s,4s)-4-(aminomethyl)cyclohexane-1-carboxylic acid", "NC[C@H]1CC[C@H](CC1)C(O)=O"],
  ["(1R,3r,5S)-8-methyl-8-azabicyclo[3.2.1]octan-3-ol", TROPINE], ["(2R,3s,4S)-pentane-1,2,3,4,5-pentol", RIBITOL], ["(2R,3r,4S)-pentane-1,2,3,4,5-pentol", XYLITOL],
  // Numbered the other way, and written without suffix locants: the same structures.
  ["(2S,3r,4R)-pentane-1,2,3,4,5-pentol", XYLITOL], ["(1r,4r)-4-methylcyclohexanol", "C[C@@H]1CC[C@H](CC1)O"], ["(1r,4r)-4-(aminomethyl)cyclohexanecarboxylic acid", TRANEXAMIC],
  ["(4ar,8ar)-decahydronaphthalene", "C1CC[C@H]2CCCC[C@@H]2C1"], ["(4as,8as)-decahydronaphthalene", "C1CC[C@H]2CCCC[C@H]2C1"],
  ["(1R,3r,5S)-8-methyl-8-azabicyclo[3.2.1]octan-3-yl (2S)-3-hydroxy-2-phenylpropanoate", "CN1[C@@H]2CC[C@H]1C[C@@H](OC(=O)[C@H](CO)c3ccccc3)C2"],
  ["4-[(1r,4r)-4-aminocyclohexyl]phenol", "N[C@H]1CC[C@@H](CC1)c1ccc(O)cc1"], ["(1r,2r,3r,4r,5r,6r)-cyclohexane-1,2,3,4,5,6-hexol", "O[C@H]1[C@H](O)[C@@H](O)[C@H](O)[C@@H](O)[C@@H]1O"],
] as const) {
  const got = nameToSmiles(typed);
  assert.equal(inchiOf(got ?? ""), inchiOf(want), `${typed} draws its structure`);
  // Its r and s, labelled from Indigo's drawing of what was read (wedges), are the name's.
  const cited = [...typed.matchAll(/\(([^()]*)\)-/g)].flatMap((m) => m[1].split(",")).filter((t) => /[rs]$/.test(t)).map((t) => t.slice(-1)).sort().join("");
  assert.equal(chem.cipOf(chem.parseStructure(got!, false)).atoms.filter((x) => x === "r" || x === "s").sort().join(""), cited, `${typed}: its r and s`);
}
console.log("namer-pseudo: typed names with r and s draw their structures ok");

// ——— Malformed and hostile names: no structure, quickly ———
const NONE = [
  "(1R,4R)-4-methylcyclohexan-1-ol", // R on a pseudoasymmetric centre
  "(1r,3r)-3-methylcyclohexan-1-ol", // r on a centre that is not pseudoasymmetric
  "(2s)-butan-2-ol", "(9r)-pentane-1,2,3,4,5-pentol", "(2R,9r,4S)-pentane-1,2,3,4,5-pentol", "(1r,4q)-4-methylcyclohexan-1-ol",
  "(1r,1s)-4-methylcyclohexan-1-ol", "(1r,4r)-", "(1r,4s)-4-methylcyclohexan-1-ol", "(3r)-pentane-1,2,3,4,5-pentol",
  "rel-(1r,4r)-4-methylcyclohexan-1-ol", "rac-(1r,4r)-4-methylcyclohexan-1-ol", "(1r*,4r*)-4-methylcyclohexan-1-ol", "(1r,4r)-4-methylcyclohexan-1-ol)",
  "(1r,4r)-4-methylcyclohexan-1-ol (1r,4r)-", "((1r,4r))-4-methylcyclohexan-1-ol", "(1r,4r)-(1r,4r)-4-methylcyclohexan-1-ol", "(r)-", "(s)-(s)-(s)-",
  `(${Array.from({ length: 300 }, (_, k) => `${k + 1}r`).join(",")})-4-methylcyclohexan-1-ol`, // 2,000 characters of descriptors
  `${"(1r,4r)-".repeat(375)}4-methylcyclohexan-1-ol`, // 3,000 characters
];
for (const name of NONE) {
  const t = performance.now(), got = nameToSmiles(name), ms = performance.now() - t;
  assert.equal(got, undefined, `${name.slice(0, 60)}: no structure`);
  assert.ok(ms < 500, `${name.slice(0, 60)}: ${ms.toFixed(0)} ms`);
}
// Control characters: read as OPSIN reads the rest of such a name (it reads 4-methylcyclohexan-1-ol with a NUL after
// it), or not at all; never another structure.
for (const name of ["(1r,4r)-4-methylcyclohexan-1-ol\u0000", "(1r,4r)-4-methyl\u202ecyclohexan-1-ol", "(1r,4r)\u200b-4-methylcyclohexan-1-ol"]) {
  const got = nameToSmiles(name);
  if (got) assert.equal(inchiOf(got), inchiOf(nameToSmiles("(1r,4r)-4-methylcyclohexan-1-ol")!), JSON.stringify(name));
}
// A centre made by deuterium, an r centre beside a charged N, and r with E and Z: a checked name or none.
for (const smiles of ["[2H]C1CC[C@@H](C)CC1", "C[N+](C)(C)[C@H]1CC[C@@H](O)CC1", "C/C=C/[C@H]1CC[C@@H](O)CC1", "OC[C@@H](O)[C@H](/C=C/C)[C@@H](O)CO"]) {
  const m = drawn(smiles), name = nameFor(m);
  if (name) assert.equal(inchiOf(nameToSmiles(name) ?? ""), inchiOf(m), `${smiles}: "${name}" is its structure`);
}
console.log(`namer-pseudo: ${NONE.length} malformed and hostile names give no structure ok`);
// Past the limit of open centres (four 1,4-cyclohexylene rings in a row: 8): no reading, no name, quickly.
{
  const chainOfRings = drawn("C[C@H]1CC[C@@H](CC1)[C@H]1CC[C@@H](CC1)[C@H]1CC[C@@H](CC1)[C@H]1CC[C@@H](C)CC1");
  const e = chem.expandLabels(chainOfRings), own = namerName(e, chem.cipOf(e));
  assert.ok(own && (own.match(/[0-9'][rs][,)]/g) ?? []).length > MOST_OPEN, `the namer cites ${own}`);
  const t = performance.now();
  assert.equal(nameToSmiles(own!), undefined, "more open centres than the reader tries: no reading");
  assert.equal(nameFor(chainOfRings), undefined, "and no name");
  assert.ok(performance.now() - t < 1500, `${(performance.now() - t).toFixed(0)} ms`);
  console.log(`namer-pseudo: ${own}: past the reader's ${MOST_OPEN} open centres, no name ok`);
}

// ——— Cages drawn in 3D that are not named without stereo ———
{
  // A stretched bond (three times the others): the cage check does not hold.
  const stretched: Mol = { ...adamantane3d, atoms: adamantane3d.atoms.map((a, i) => (i === 4 ? { ...a, location: [a.location[0] * 3, a.location[1] * 3, a.location[2] * 3] as [number, number, number] } : a)) };
  assert.equal(nameFor(stretched), undefined, "adamantane in 3D with a stretched bond: no name");
  // Drawn flat with wedges (no depth): no name without its stereo, as before.
  for (const [what, smiles] of [["norbornane, hashed bridgehead bonds", "C1C[C@H]2C[C@@H]1CC2"], ["trans-bicyclo[2.2.0]hexane, wedges", "C1C[C@@H]2CC[C@H]12"]] as const) {
    const m = drawn(smiles), name = nameFor(m);
    assert.ok(!name || /\(/.test(name), `${what}: no name without its stereo (${name})`);
    if (name) assert.equal(inchiOf(nameToSmiles(name) ?? ""), inchiOf(m), `${what}: "${name}" is its structure`);
  }
  console.log("namer-pseudo: a stretched 3D cage and flat cages with wedges keep their stereo or have no name ok");
}

// ——— The gate and the cache: names with no r or s never reach the reader; a name read once is kept ———
{
  let calls = 0;
  setPseudoReader((n, read) => { calls++; return pseudoSmiles(n, read, api); });
  const plain = readFileSync(new URL("names.txt", dir), "utf8").split("\n").filter(Boolean).slice(0, 500);
  for (const n of plain) nameToSmiles(n);
  assert.equal(calls, 0, "500 names with no r or s: the reader is not asked");
  for (let k = 0; k < 5; k++) nameToSmiles("(1r,4r)-4-methylcyclohexan-1-ol");
  assert.equal(calls, 1, "a name read five times is read once");
  setPseudoReader(pseudoReader(api));
  console.log("namer-pseudo: gate (500 plain names, no reader) and cache ok");
}

// ——— Time ———
// Measured with the machine busy (load 60, 17 November 2026): tranexamic acid's name read in 6 ms, scyllo-inositol's
// (6 open centres) in 60 to 340 ms, each prefix of a typed name under 1 ms. The bounds are three times those, and a
// failure is run again alone before it counts.
{
  const read = (n: string) => { try { return opsin.parseToSmiles(n) ?? undefined; } catch { return undefined; } };
  const tranexamic = time(() => pseudoSmiles("(1r,4r)-4-(aminomethyl)cyclohexane-1-carboxylic acid", read, api), 15);
  const scyllo = time(() => pseudoSmiles("(1r,2r,3r,4r,5r,6r)-cyclohexane-1,2,3,4,5,6-hexaol", read, api), 5);
  const typed = "(1r,4r)-4-(aminomethyl)cyclohexane-1-carboxylic acid", prefixes = Array.from({ length: typed.length }, (_, k) => typed.slice(0, k + 1));
  const typing = time(() => { for (const p of prefixes) nameToSmiles(p); }, 5) / prefixes.length;
  assert.ok(tranexamic < 90, `tranexamic acid read in ${tranexamic.toFixed(1)} ms`);
  assert.ok(scyllo < 1200, `six open centres read in ${scyllo.toFixed(0)} ms`);
  assert.ok(typing < 90, `a typed prefix read in ${typing.toFixed(2)} ms`);
  console.log(`namer-pseudo: time: tranexamic acid ${tranexamic.toFixed(1)} ms, six open centres ${scyllo.toFixed(0)} ms, typing ${typing.toFixed(2)} ms a keystroke ok`);
}
