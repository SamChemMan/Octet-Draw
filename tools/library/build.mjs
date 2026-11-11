// Builds src/library.json, Octet's own template library. Run: node tools/library/build.mjs
// - Structures from their names: each name goes through OPSIN (or its SMILES is given), Indigo lays it out, and the
//   drawing is kept at bond length 1, centred. A functional group's first atom is its R, where it joins.
// - Structures drawn in perspective (perspective.mjs) and π complexes (organometallics.mjs), worked out from geometry.
//   A hexose's or Fischer projection's stereocentres are placed each way, and the build keeps the way whose InChI is
//   the named compound's.
// - The Lab group (glassware and lamps) is drawn in lab.mjs and glassware.mjs, Lab equipment in equipment.mjs,
//   Biomolecules and Cells in bio.mjs, BioArt, Anatomy, Organisms and Bugs in life.mjs, and Symbols in symbols.mjs (all
//   through art.mjs); coordination geometries, cages and carbon allotropes are worked out in polyhedra.mjs, and
//   macrocyclic hosts in hosts.mjs.
// Nothing comes from another program's files.
import { readFileSync, writeFileSync } from "node:fs";
import { HBOND } from "../../src/render.ts";
import { LAB, TLC } from "./lab.mjs";
import { conformers, cube, fischerWays, FRUCTOSES, hexose, HEXOSES, paddlewheel, PADDLEWHEELS, stereocentres } from "./perspective.mjs";
import { clashes } from "./clashes.mjs";
import { CP_RINGS, DPPF, METALLOCENES } from "./organometallics.mjs";
import { CARBON, POLYHEDRA } from "./polyhedra.mjs";
import { HOSTS, hostLengths } from "./hosts.mjs";
import { GLASSWARE } from "./glassware.mjs";
import { EQUIPMENT } from "./equipment.mjs";
import { BIOMOLECULES, CELLS } from "./bio.mjs";
import { ANATOMY, BIOART, BUGS, ORGANISMS } from "./life.mjs";
import { SYMBOLS } from "./symbols.mjs";

const root = new URL("../../", import.meta.url);
const pack = readFileSync(new URL("src/vendor/opsin/opsin-data.bin", root));
const files = new Map();
for (let p = 0; ; ) {
  const n = pack.readUInt16BE(p); p += 2;
  if (!n) break;
  const name = pack.toString("latin1", p, p + n); p += n;
  const size = pack.readInt32BE(p); p += 4;
  files.set(name, new Int8Array(pack.buffer, pack.byteOffset + p, size)); p += size;
}
globalThis.opsinResource = (name) => files.get(name) ?? null;
const opsin = await import(new URL("src/vendor/opsin/opsin.js", root).href);
opsin.init();
const indigo = await (await import(new URL("node_modules/indigo-ketcher/indigo-ketcher-norender.js", root).href)).default();
// chem.ts (for InChIs) reads the drawing tokens and loads Indigo's wasm as a browser does; these stand in for the browser.
Object.assign(globalThis, {
  document: { documentElement: {}, createElement: () => ({ getContext: () => ({}) }) }, getComputedStyle: () => ({ getPropertyValue: () => "10" }),
  window: globalThis, self: { location: { origin: "file://" } },
  fetch: async (u) => new Response(readFileSync(new URL(String(u))), { headers: { "content-type": "application/wasm" } }),
});
const chem = await import(new URL("src/chem.ts", root).href);
await chem.ready;

// [shown name, OPSIN name or "smiles:...", more words the search finds it by]. A shown name alone is read by OPSIN.
const NAMED = {
  "Amino acids": [
    ["Glycine"], ["Alanine", "L-alanine"], ["Valine", "L-valine"], ["Leucine", "L-leucine"], ["Isoleucine", "L-isoleucine"],
    ["Proline", "L-proline"], ["Phenylalanine", "L-phenylalanine"], ["Tryptophan", "L-tryptophan"], ["Methionine", "L-methionine"],
    ["Serine", "L-serine"], ["Threonine", "L-threonine"], ["Cysteine", "L-cysteine"], ["Tyrosine", "L-tyrosine"], ["Asparagine", "L-asparagine"],
    ["Glutamine", "L-glutamine"], ["Aspartic acid", "L-aspartic acid"], ["Glutamic acid", "L-glutamic acid"], ["Lysine", "L-lysine"],
    ["Arginine", "L-arginine"], ["Histidine", "L-histidine"],
  ],
  "Sugars": [
    ["α-D-Glucopyranose", "alpha-D-glucopyranose"], ["β-D-Glucopyranose", "beta-D-glucopyranose"], ["β-D-Galactopyranose", "beta-D-galactopyranose"],
    ["α-D-Mannopyranose", "alpha-D-mannopyranose"], ["β-D-Fructofuranose", "beta-D-fructofuranose"], ["β-D-Ribofuranose", "beta-D-ribofuranose"],
    ["2-Deoxy-β-D-ribofuranose", "2-deoxy-beta-D-ribofuranose"], ["D-Glucose (open chain)", "D-glucose"],
  ],
  "Stereocentres": [
    ["(R)-Bromochlorofluoromethane", "(1R)-bromo(chloro)(fluoro)methane", "CHBrClF"], ["(S)-Bromochlorofluoromethane", "(1S)-bromo(chloro)(fluoro)methane", "CHBrClF"],
    ["(R)-Butan-2-ol", "(2R)-butan-2-ol", "2-butanol"], ["(S)-Butan-2-ol", "(2S)-butan-2-ol", "2-butanol"],
    ["(R)-Lactic acid", "(2R)-2-hydroxypropanoic acid", "D-lactic acid"], ["(S)-Lactic acid", "(2S)-2-hydroxypropanoic acid", "L-lactic acid"],
    ["(R)-Glyceraldehyde", "(2R)-2,3-dihydroxypropanal", "D-glyceraldehyde"], ["(S)-Glyceraldehyde", "(2S)-2,3-dihydroxypropanal", "L-glyceraldehyde"],
    ["(R,R)-Tartaric acid", "(2R,3R)-2,3-dihydroxybutanedioic acid", "L-tartaric acid"], ["(S,S)-Tartaric acid", "(2S,3S)-2,3-dihydroxybutanedioic acid", "D-tartaric acid"],
    ["meso-Tartaric acid", "(2R,3S)-2,3-dihydroxybutanedioic acid"],
    ["trans-Cyclohexane-1,2-diol", "(1R,2R)-cyclohexane-1,2-diol"], ["cis-Cyclohexane-1,2-diol", "(1R,2S)-cyclohexane-1,2-diol"],
  ],
  "Cycloalkanes": [
    ["Cyclopropane"], ["Cyclobutane"], ["Cyclopentane"], ["Cyclohexane"], ["Cycloheptane"], ["Cyclooctane"],
    ["Cyclopropene"], ["Cyclobutene"], ["Cyclopentene"], ["Cyclopentadiene", "cyclopenta-1,3-diene", "CpH"], ["Cyclohexene"],
    ["Cyclohexa-1,3-diene"], ["Cyclohexa-1,4-diene"], ["Cycloheptene"], ["Cycloheptatriene", "cyclohepta-1,3,5-triene"],
    ["Cyclooctene", "(Z)-cyclooctene"], ["Cyclooctatetraene", "cycloocta-1,3,5,7-tetraene", "COT"],
  ],
  "Aromatics": [
    ["Benzene"], ["Toluene"], ["o-Xylene", "1,2-dimethylbenzene"], ["m-Xylene", "1,3-dimethylbenzene"], ["p-Xylene", "1,4-dimethylbenzene"],
    ["Mesitylene", "1,3,5-trimethylbenzene"], ["Styrene", "ethenylbenzene"], ["Biphenyl", "1,1'-biphenyl"], ["p-Terphenyl", "1,4-diphenylbenzene"],
    ["Naphthalene"], ["Azulene"], ["Indene", "1H-indene"], ["Indane", "2,3-dihydro-1H-indene"], ["Tetralin", "1,2,3,4-tetrahydronaphthalene"],
    ["Fluorene", "9H-fluorene"], ["Anthracene"], ["Phenanthrene"], ["Acenaphthylene"], ["Fluoranthene"], ["Tetracene"], ["Triphenylene"],
    ["Chrysene"], ["Pyrene"], ["Perylene"], ["Coronene"],
  ],
  "Bicyclics": [
    ["Bicyclo[1.1.0]butane"], ["Bicyclo[1.1.1]pentane"], ["Bicyclo[2.1.1]hexane"], ["Bicyclo[3.1.0]hexane"], ["Norcarane", "bicyclo[4.1.0]heptane"],
    ["Bicyclo[3.1.1]heptane"], ["Norbornane", "bicyclo[2.2.1]heptane"], ["Norbornene", "bicyclo[2.2.1]hept-2-ene"],
    ["Norbornadiene", "bicyclo[2.2.1]hepta-2,5-diene", "nbd"], ["Bicyclo[2.2.2]octane"], ["Bicyclo[3.2.1]octane"],
    ["Bicyclo[3.3.0]octane", "octahydropentalene"], ["Bicyclo[4.2.0]octane"], ["Bicyclo[3.3.1]nonane"], ["Hydrindane", "octahydro-1H-indene"],
    ["Decalin", "decahydronaphthalene"], ["cis-Decalin", "cis-decahydronaphthalene"], ["trans-Decalin", "trans-decahydronaphthalene"],
    ["Adamantane"], ["Spiro[2.2]pentane"], ["Spiro[3.3]heptane"], ["Spiro[4.5]decane"], ["Spiro[5.5]undecane"],
  ],
  "Heterocycles": [
    ["Pyridine"], ["Pyrrole", "1H-pyrrole"], ["Furan"], ["Thiophene"], ["Imidazole", "1H-imidazole"], ["Pyrazole", "1H-pyrazole"], ["Oxazole"], ["Thiazole"],
    ["Pyrimidine"], ["Pyrazine"], ["Pyridazine"], ["1,3,5-Triazine"], ["Tetrazole", "1H-tetrazole"], ["Indole", "1H-indole"], ["Benzofuran", "1-benzofuran"],
    ["Benzothiophene", "1-benzothiophene"], ["Quinoline"], ["Isoquinoline"], ["Purine", "7H-purine"], ["Carbazole", "9H-carbazole"],
    ["Piperidine"], ["Piperazine"], ["Morpholine"], ["Pyrrolidine"], ["Tetrahydrofuran", "oxolane"], ["Tetrahydropyran", "oxane"], ["Oxetane"], ["Oxirane"], ["Aziridine"],
  ],
  // Nucleosides and nucleotides of DNA and RNA (the base pairs are drawn from the Nucleobases below).
  "DNA and RNA": [
    ["2'-Deoxyadenosine", "2'-deoxyadenosine", "dA, DNA, nucleoside"], ["2'-Deoxyguanosine", "2'-deoxyguanosine", "dG, DNA, nucleoside"],
    ["2'-Deoxycytidine", "2'-deoxycytidine", "dC, DNA, nucleoside"], ["Thymidine", "thymidine", "dT, DNA, nucleoside"],
    ["Adenosine", "adenosine", "A, RNA, nucleoside"], ["Guanosine", "guanosine", "G, RNA, nucleoside"],
    ["Cytidine", "cytidine", "C, RNA, nucleoside"], ["Uridine", "uridine", "U, RNA, nucleoside"],
    ["dAMP", "2'-deoxyadenosine 5'-monophosphate", "deoxyadenosine monophosphate, DNA, nucleotide"],
    ["dGMP", "2'-deoxyguanosine 5'-monophosphate", "deoxyguanosine monophosphate, DNA, nucleotide"],
    ["dCMP", "2'-deoxycytidine 5'-monophosphate", "deoxycytidine monophosphate, DNA, nucleotide"],
    ["dTMP", "thymidine 5'-monophosphate", "thymidine monophosphate, DNA, nucleotide"],
    ["AMP", "adenosine 5'-monophosphate", "adenosine monophosphate, RNA, nucleotide"], ["GMP", "guanosine 5'-monophosphate", "guanosine monophosphate, RNA, nucleotide"],
    ["CMP", "cytidine 5'-monophosphate", "cytidine monophosphate, RNA, nucleotide"], ["UMP", "uridine 5'-monophosphate", "uridine monophosphate, RNA, nucleotide"],
    ["ADP", "adenosine 5'-diphosphate", "adenosine diphosphate, nucleotide"], ["ATP", "adenosine 5'-triphosphate", "adenosine triphosphate, nucleotide"],
    ["cAMP", "smiles:Nc1ncnc2n(cnc12)[C@@H]1O[C@@H]2COP(=O)(O)O[C@H]2[C@H]1O", "cyclic AMP, adenosine 3',5'-cyclic phosphate, nucleotide"],
  ],
  // Macrocycles and hosts. Calixarenes, pillar[5]arene and [2.2]paracyclophane are drawn in hosts.mjs, as Indigo's
  // flat layout draws them badly (rings over their own OH groups).
  "Supramolecules": [
    ["12-Crown-4", "1,4,7,10-tetraoxacyclododecane", "crown ether"], ["15-Crown-5", "1,4,7,10,13-pentaoxacyclopentadecane", "crown ether"],
    ["18-Crown-6", "1,4,7,10,13,16-hexaoxacyclooctadecane", "crown ether"], ["Benzo-15-crown-5", "smiles:C1COCCOc2ccccc2OCCOCCO1", "crown ether"],
    ["Dibenzo-18-crown-6", "smiles:c1ccc2c(c1)OCCOCCOc1ccccc1OCCOCCO2", "crown ether, DB18C6"],
    ["Dicyclohexano-18-crown-6", "smiles:C1CCC2C(C1)OCCOCCOC1CCCCC1OCCOCCO2", "crown ether, DCH18C6"],
    ["[2.2.2]Cryptand", "4,7,13,16,21,24-hexaoxa-1,10-diazabicyclo[8.8.8]hexacosane", "cryptand, Kryptofix 222"],
    ["[2.2.1]Cryptand", "smiles:N12CCOCCOCCN(CCOCC1)CCOCCOCC2", "cryptand"], ["[2.1.1]Cryptand", "smiles:N12CCOCCOCCN(CCOCC1)CCOCC2", "cryptand"],
    ["Cyclen", "1,4,7,10-tetraazacyclododecane", "macrocycle, tetraaza"], ["Cyclam", "1,4,8,11-tetraazacyclotetradecane", "macrocycle, tetraaza"],
  ],
  // Names as common.ts keys them, so the library's search shows the library's own drawing for an abbreviation.
  "Ligands": [
    ["PPh3", "triphenylphosphane", "triphenylphosphine"], ["PCy3", "tricyclohexylphosphane"], ["P(t-Bu)3", "tri-tert-butylphosphane"],
    ["dppm", "methylenebis(diphenylphosphane)"], ["dppe", "ethane-1,2-diylbis(diphenylphosphane)"], ["dppp", "propane-1,3-diylbis(diphenylphosphane)"],
    ["BINAP", "[1,1'-binaphthalene]-2,2'-diylbis(diphenylphosphane)"], ["Xantphos", "(9,9-dimethyl-9H-xanthene-4,5-diyl)bis(diphenylphosphane)"],
    ["XPhos", "smiles:CC(C)c1cc(C(C)C)c(-c2ccccc2P(C2CCCCC2)C2CCCCC2)c(C(C)C)c1"], ["SPhos", "smiles:COc1cccc(OC)c1-c1ccccc1P(C1CCCCC1)C1CCCCC1"],
    ["bpy", "2,2'-bipyridine", "bipy"], ["dtbbpy", "4,4'-di-tert-butyl-2,2'-bipyridine"], ["phen", "1,10-phenanthroline"],
    ["tpy", "2,2':6',2''-terpyridine", "terpy, terpyridine"], ["en", "ethane-1,2-diamine", "ethylenediamine"],
    ["TMEDA", "N,N,N',N'-tetramethylethane-1,2-diamine"], ["cod", "cycloocta-1,5-diene"], ["dba", "(1E,4E)-1,5-diphenylpenta-1,4-dien-3-one"],
    ["Cp", "smiles:[CH-]1C=CC=C1", "cyclopentadienyl"], ["Cp*", "smiles:C[C-]1C(C)=C(C)C(C)=C1C", "pentamethylcyclopentadienyl"],
    ["Cp*H", "1,2,3,4,5-pentamethylcyclopenta-1,3-diene"], ["acacH", "pentane-2,4-dione", "acac, acetylacetone"],
    ["salen", "smiles:Oc1ccccc1/C=N/CC/N=C/c1ccccc1O"], ["Porphyrin", "21H,23H-porphine", "porphine"],
    ["H2TPP", "5,10,15,20-tetraphenyl-21H,23H-porphine", "tetraphenylporphyrin"], ["Phthalocyanine", "29H,31H-phthalocyanine"],
    ["IMes", "smiles:Cc1cc(C)c(c(C)c1)N1[C]N(C=C1)c1c(C)cc(C)cc1C"], ["IPr", "smiles:CC(C)c1cccc(C(C)C)c1N1[C]N(c2c(C(C)C)cccc2C(C)C)C=C1"],
    ["DMAP", "N,N-dimethylpyridin-4-amine"], ["DABCO", "1,4-diazabicyclo[2.2.2]octane"],
    ["BOX", "2,2'-(propane-2,2-diyl)bis(4,5-dihydro-1,3-oxazole)", "bis(oxazoline)"], ["PyBOX", "smiles:C1COC(=N1)c1cccc(n1)C1=NCCO1", "pybox"],
  ],
};
// Functional groups: [name, SMILES with the R atom first, more words].
const GROUPS = [
  ["Alkene", "CC=C", "vinyl"], ["Alkyne", "CC#C", "ethynyl"], ["Halide", "CX", "alkyl halide, halogen"], ["Alcohol", "CO", "hydroxy"],
  ["Ether", "COC", "methoxy"], ["Aldehyde", "CC=O", "formyl"], ["Ketone", "CC(C)=O", "carbonyl"], ["Carboxylic acid", "CC(=O)O", "carboxy, COOH"],
  ["Ester", "CC(=O)OC", "carboxylate"], ["Amide", "CC(N)=O", "carboxamide"], ["Weinreb amide", "CC(=O)N(C)OC"], ["Acid chloride", "CC(Cl)=O", "acyl chloride"],
  ["Anhydride", "CC(=O)OC(C)=O", "acid anhydride"], ["Imide", "CC(=O)NC(C)=O"], ["Thioester", "CC(=O)SC"], ["Nitrile", "CC#N", "cyano"],
  ["Primary amine", "CN", "amino"], ["Secondary amine", "CNC", "amino"], ["Tertiary amine", "CN(C)C", "amino"], ["Imine", "C/C=N/C", "Schiff base"],
  ["Oxime", "C/C=N/O"], ["Hydrazone", "C/C=N/N"], ["Nitro", "C[N+](=O)[O-]"], ["Nitroso", "CN=O"], ["Azide", "CN=[N+]=[N-]"],
  ["Diazo", "CC=[N+]=[N-]"], ["Isocyanate", "CN=C=O"], ["Isothiocyanate", "CN=C=S"], ["Carbamate", "CNC(=O)OC", "urethane"],
  ["Urea", "CNC(N)=O"], ["Guanidine", "CNC(N)=N"], ["Carbonate", "COC(=O)OC"], ["Acetal", "CC(OC)OC"], ["Thiol", "CS", "sulfanyl, mercaptan"],
  ["Sulfide", "CSC", "thioether"], ["Disulfide", "CSSC"], ["Sulfoxide", "CS(C)=O"], ["Sulfone", "CS(C)(=O)=O"], ["Sulfonic acid", "CS(=O)(=O)O"],
  ["Sulfonamide", "CS(N)(=O)=O"], ["Sulfonate ester", "CS(=O)(=O)OC", "mesylate, tosylate"], ["Phosphate", "COP(=O)(O)O"],
  ["Boronic acid", "CB(O)O"], ["Pinacol boronate", "CB1OC(C)(C)C(C)(C)O1", "Bpin, boronic ester"],
];
// Fischer projections: [name, top, centres, group, bottom, the compound's name, more words].
const FISCHER = [
  ["D-Glyceraldehyde (Fischer)", "CHO", 1, "O", "CH2OH", "(2R)-2,3-dihydroxypropanal", "(R)-glyceraldehyde, Fischer projection"],
  ["L-Glyceraldehyde (Fischer)", "CHO", 1, "O", "CH2OH", "(2S)-2,3-dihydroxypropanal", "(S)-glyceraldehyde, Fischer projection"],
  ["L-Alanine (Fischer)", "COOH", 1, "N", "CH3", "L-alanine", "(S)-alanine, Fischer projection"],
  ["D-Ribose (Fischer)", "CHO", 3, "O", "CH2OH", "D-ribose", "Fischer projection"],
  ["D-Glucose (Fischer)", "CHO", 4, "O", "CH2OH", "D-glucose", "Fischer projection"],
];

const opts = new indigo.MapStringString();
opts.set("output-content-type", "application/json");
opts.set("dearomatize-on-load", "true");
const r3 = (n) => Math.round(n * 1000) / 1000 + 0;
const failed = [];
const smilesOf = (source) => { if (source.startsWith("smiles:")) return source.slice(7); try { return opsin.parseToSmiles(source) || ""; } catch { return ""; } };
const inchiOf = (s) => { try { return chem.toInchi(s); } catch { return undefined; } };
// A structure from SMILES as Indigo lays it out: bond length 1 (the median), centred on its atoms.
function laidOut(smiles) {
  const ket = JSON.parse(JSON.parse(indigo.layout(smiles, "ket", opts)).struct);
  const atoms = [], bonds = [];
  for (const { $ref } of ket.root.nodes) {
    const f = ket[$ref];
    if (f?.type !== "molecule") continue;
    const base = atoms.length;
    atoms.push(...f.atoms.map((a) => ({ label: a.label, x: a.location[0], y: a.location[1], charge: a.charge, radical: a.radical })));
    bonds.push(...f.bonds.map((b) => [b.atoms[0] + base, b.atoms[1] + base, b.type, ...(b.stereo ? [b.stereo] : [])]));
  }
  const lengths = bonds.map(([a, b]) => Math.hypot(atoms[a].x - atoms[b].x, atoms[a].y - atoms[b].y)).sort((a, b) => a - b);
  const k = 1 / (lengths[Math.floor(lengths.length / 2)] || 1);
  const cx = atoms.reduce((s, a) => s + a.x, 0) / atoms.length, cy = atoms.reduce((s, a) => s + a.y, 0) / atoms.length;
  return { atoms: atoms.map((a) => ({ ...a, x: r3((a.x - cx) * k), y: r3((a.y - cy) * k) })), bonds };
}
// KET's radical (1 a singlet, as a carbene's lone pair; 2 one unpaired electron; 3 two) as Octet keeps it (render.ts
// Atom.radical: 1 a doublet, 2 a triplet, 3 a singlet).
const octetRadical = (r) => (r === 1 ? 3 : r - 1);
// A laid-out structure in the library's short form: [label, x, y, charge, radical] and [a, b, type, stereo].
const compact = ({ atoms, bonds }) => ({
  atoms: atoms.map((a) => [a.label, a.x, a.y, ...(a.charge || a.radical ? [a.charge ?? 0] : []), ...(a.radical ? [octetRadical(a.radical)] : [])]), bonds,
});
// The same as a Mol, for structures the short form cannot hold (a written label).
const asMol = ({ atoms, bonds }) => ({
  atoms: atoms.map((a) => ({ label: a.label, location: [a.x, a.y, 0], ...(a.charge ? { charge: a.charge } : {}), ...(a.radical ? { radical: octetRadical(a.radical) } : {}) })),
  bonds: bonds.map(([a, b, type, stereo]) => ({ type, atoms: [a, b], ...(stereo ? { stereo } : {}) })),
});
const entry = (name, also, body) => ({ name, ...(also ? { also } : {}), ...body });
const rounded = (m) => ({ ...m, atoms: m.atoms.map((a) => ({ ...a, location: a.location.map(r3) })) });


// The way (of several drawings) that is the named compound: its InChI, stereochemistry included, is the name's.
function picker(name) {
  const want = inchiOf(smilesOf(name));
  if (!want) throw new Error(`no InChI for ${name}`);
  return (list, get = (x) => x) => {
    const found = list.filter((x) => inchiOf(get(x)) === want);
    if (found.length > 1) throw new Error(`${name}: ${found.length} drawings are it`);
    return found[0];
  };
}
const fail = (what) => { throw new Error(what); };

const out = [];
// Bridged rings (norbornane, adamantane) stay flat, as Indigo lays them out: drawn in 3D, their bridgeheads read as
// stereocentres, and Structure to Name gives them no name. Where Indigo's layout runs a bond through a label (a
// porphyrin's NH), Octet's Clean Up lays it out again, and the clearer of the two is kept.
const named = (category) => NAMED[category].flatMap(([shown, source = shown, also]) => {
  const smiles = smilesOf(source);
  if (!smiles) { failed.push(shown); return []; }
  const flat = laidOut(smiles), crowded = clashes(asMol(flat)).length;
  if (crowded) { const again = rounded(chem.cleanUp(asMol(flat))); if (clashes(again).length < crowded) return [entry(shown, also, { mol: again })]; }
  return [entry(shown, also, compact(flat))];
});
// The nucleobases all face one way: the atom that bonds to the sugar (N9 of a purine, N1 of a pyrimidine) at the
// bottom, its bond to the sugar pointing straight down, and the Watson-Crick edge (N1 or N3 and the groups beside it)
// on the right (a pyrimidine's C4 group on the line straight up from N1). Purines are the 9H tautomers, so the NH is where the sugar goes. [name, SMILES with the sugar's N
// first, the Watson-Crick atoms by their place in the SMILES, the other edge's atoms (C5, C6 or N7, C8)].
export const NUCLEOBASES = [
  ["Adenine", "N1C=NC2=C1N=CN=C2N", [6, 7, 8, 9], [1, 2]],
  ["Guanine", "N1C=NC2=C1N=C(N)NC2=O", [6, 7, 8, 9, 10], [1, 2]],
  ["Cytosine", "N1C=CC(N)=NC1=O", [3, 4, 5, 6, 7], [1, 2]],
  ["Thymine", "N1C=C(C)C(=O)NC1=O", [4, 5, 6, 7, 8], [1, 2, 3]],
  ["Uracil", "N1C=CC(=O)NC1=O", [3, 4, 5, 6, 7], [1, 2]],
];
function nucleobases() {
  return NUCLEOBASES.map(([name, smiles, edge, back]) => {
    const { atoms, bonds } = laidOut(smiles), at = atoms[0];
    if (inchiOf(smiles) !== inchiOf(smilesOf(name.toLowerCase()))) fail(`${name}: the SMILES is not ${name.toLowerCase()}`);
    // The sugar's bond points away from the middle of N's two ring neighbours: turn it to straight down.
    const ring = bonds.flatMap(([a, b]) => (a === 0 ? [b] : b === 0 ? [a] : []));
    const mx = ring.reduce((s, j) => s + atoms[j].x, 0) / ring.length - at.x, my = ring.reduce((s, j) => s + atoms[j].y, 0) / ring.length - at.y;
    const turn = -Math.PI / 2 - Math.atan2(-my, -mx), c = Math.cos(turn), s = Math.sin(turn);
    let placed = atoms.map((a) => ({ ...a, x: (a.x - at.x) * c - (a.y - at.y) * s, y: (a.x - at.x) * s + (a.y - at.y) * c }));
    // Mirrored if the Watson-Crick edge came out on the left (a flat base has no stereochemistry to lose).
    if (edge.reduce((t, j) => t + placed[j].x, 0) < 0) placed = placed.map((a) => ({ ...a, x: -a.x }));
    const cx = placed.reduce((t, a) => t + a.x, 0) / placed.length, cy = placed.reduce((t, a) => t + a.y, 0) / placed.length;
    const mol = { atoms: placed.map((a) => ({ ...a, x: r3(a.x - cx), y: r3(a.y - cy) })), bonds };
    const y0 = mol.atoms[0].y;
    if (mol.atoms.some((a) => a.y < y0 - 0.005) || edge.some((j) => mol.atoms[j].x < mol.atoms[0].x - 0.005) || back.some((j) => mol.atoms[j].x >= mol.atoms[0].x)) fail(`${name}: not facing the right way`);
    if (clashes(asMol(mol)).length) fail(`${name}: labels clash`);
    return entry(name, undefined, compact(mol));
  });
}

// Watson-Crick base pairs, drawn from the nucleobases above: the purine as it is (its Watson-Crick edge on the right),
// the pyrimidine mirrored to face it, placed so each pair of hydrogen-bonded atoms is HB bond lengths apart (2.9 Å over
// a 1.4 Å bond). Each donor's H is drawn, with a hydrogen bond (dashed) to its acceptor, and R marks each sugar.
// [name, purine, pyrimidine, [purine atom, pyrimidine atom, the donor's side (0 the purine, 1 the pyrimidine)]...],
// atoms by their place in NUCLEOBASES' SMILES.
const HB = 2.05;
const BASE_PAIRS = [
  ["A·T base pair", "Adenine", "Thymine", [[9, 5, 0], [7, 6, 1]], "Watson-Crick, adenine, thymine, DNA"],
  ["G·C base pair", "Guanine", "Cytosine", [[10, 4, 1], [8, 5, 0], [7, 7, 0]], "Watson-Crick, guanine, cytosine, DNA, RNA"],
  ["A·U base pair", "Adenine", "Uracil", [[9, 4, 0], [7, 5, 1]], "Watson-Crick, adenine, uracil, RNA"],
];
function basePairs(bases) {
  const byName = new Map(bases.map((b) => [b.name, b]));
  return BASE_PAIRS.map(([name, purine, pyrimidine, links, also]) => {
    const p = byName.get(purine), q = byName.get(pyrimidine);
    // Each base turned about its middle (the pyrimidine mirrored first, to face the purine), then the pyrimidine moved
    // by (dx, dy). A base's sugar bond is its own straight down, turned with it.
    const spin = (list, turn, dx = 0, dy = 0) => { const cx = list.reduce((t, a) => t + a.x, 0) / list.length, cy = list.reduce((t, a) => t + a.y, 0) / list.length, c = Math.cos(turn), s = Math.sin(turn); return list.map((a) => ({ ...a, x: (a.x - cx) * c - (a.y - cy) * s + dx, y: (a.x - cx) * s + (a.y - cy) * c + dy })); };
    const P0 = p.atoms.map((a) => ({ label: a[0], x: a[1], y: a[2] })), Q0 = q.atoms.map((a) => ({ label: a[0], x: -a[1], y: a[2] }));
    const place = (tp, tq, dx, dy) => [spin(P0, tp), spin(Q0, tq, dx, dy)];
    // The hydrogen bonds' lengths; no two atoms of the pair closer than 1.5 bond lengths; and the two sugar bonds
    // alike either side of the line across the middle of the pair, as in a real Watson-Crick pair.
    const fit = ([P, Q]) => links.reduce((t, [i, j]) => t + (Math.hypot(P[i].x - Q[j].x, P[i].y - Q[j].y) - HB) ** 2, 0);
    const alike = ([P, Q], tp, tq) => {
      const r = links.reduce(([u, v], [i, j]) => [u + Q[j].x - P[i].x, v + Q[j].y - P[i].y], [0, 0]), l = Math.hypot(...r) || 1;
      return ((Math.sin(tp) * r[0] - Math.cos(tp) * r[1]) / l + (Math.sin(tq) * r[0] - Math.cos(tq) * r[1]) / l) ** 2;
    };
    const cost = (pq, tp, tq) => fit(pq) + alike(pq, tp, tq) + pq[0].reduce((t, a) => t + pq[1].reduce((u, b) => u + Math.max(0, 1.5 - Math.hypot(a.x - b.x, a.y - b.y)) ** 2, 0), 0) * 10;
    // The best turns and place, by a coarse search then finer ones about it.
    let best = [0, 0, 4, 0], most = Infinity;
    for (const [d, step] of [[null, [0.08, 0.2, 0.2]], [[0.1, 0.25, 0.25], [0.01, 0.02, 0.02]], [[0.012, 0.025, 0.025], [0.002, 0.004, 0.004]]]) {
      const [a0, a1, b0, b1, x0, x1, y0, y1] = d ? [best[0] - d[0], best[0] + d[0], best[1] - d[0], best[1] + d[0], best[2] - d[1], best[2] + d[1], best[3] - d[2], best[3] + d[2]] : [-1.6, 1.6, -1.6, 1.6, 0, 7, -4, 4];
      for (let a = a0; a <= a1; a += step[0]) for (let b = b0; b <= b1; b += step[0]) for (let x = x0; x <= x1; x += step[1]) for (let y = y0; y <= y1; y += step[2]) {
        const c = cost(place(a, b, x, y), a, b);
        if (c < most) { most = c; best = [a, b, x, y]; }
      }
    }
    const [P, Q] = place(...best);
    const atoms = [...P, ...Q], n = P.length;
    const bonds = [...p.bonds.map((b) => [...b]), ...q.bonds.map(([a, b, type, stereo]) => [a + n, b + n, type, ...(stereo ? [stereo] : [])])];
    // Each donor's H, 0.9 bond lengths from it towards its acceptor, and the hydrogen bond on from the H.
    for (const [i, j, donorSide] of links) {
      const [d, acc] = donorSide ? [j + n, i] : [i, j + n], A = atoms[d], B = atoms[acc], L = Math.hypot(B.x - A.x, B.y - A.y);
      atoms.push({ label: "H", x: A.x + ((B.x - A.x) / L) * 0.9, y: A.y + ((B.y - A.y) / L) * 0.9 });
      bonds.push([d, atoms.length - 1, 1], [atoms.length - 1, acc, HBOND]);
    }
    // R where each sugar joins, on from the glycosidic N (atom 0 of each base) along the base's own down.
    for (const [k, t] of [[0, best[0]], [n, best[1]]]) { atoms.push({ label: "R", x: atoms[k].x + Math.sin(t), y: atoms[k].y - Math.cos(t) }); bonds.push([k, atoms.length - 1, 1]); }
    // Turned so the hydrogen bonds run across the page, the sugars below.
    const run = links.reduce(([u, v], [i, j]) => [u + atoms[j + n].x - atoms[i].x, v + atoms[j + n].y - atoms[i].y], [0, 0]), level = -Math.atan2(run[1], run[0]);
    for (const a of atoms) [a.x, a.y] = [a.x * Math.cos(level) - a.y * Math.sin(level), a.x * Math.sin(level) + a.y * Math.cos(level)];
    const cx = (Math.min(...atoms.map((a) => a.x)) + Math.max(...atoms.map((a) => a.x))) / 2, cy = (Math.min(...atoms.map((a) => a.y)) + Math.max(...atoms.map((a) => a.y))) / 2;
    const mol = { atoms: atoms.map((a) => ({ label: a.label === "R" ? "C" : a.label, ...(a.label === "R" ? { text: "R" } : {}), location: [r3(a.x - cx), r3(a.y - cy), 0] })), bonds: bonds.map(([a, b, type]) => ({ type, atoms: [a, b] })) };
    most = fit([P, Q]);
    if (Math.sqrt(most / links.length) > 0.15) fail(`${name}: hydrogen bonds ${Math.sqrt(most / links.length).toFixed(2)} from ${HB} bond lengths`);
    return entry(name, also, { mol });
  });
}

// Amino acid side chains: [name, three-letter code, SMILES with R first (where it joins the α carbon)]. Glycine's is H.
// Proline's closes a ring on the backbone N: its ring is drawn whole, with R on the α carbon (to the C=O) and on the
// N (to the residue before), its last atom.
const SIDE_CHAINS = [
  ["Alanine", "Ala", "CC"], ["Arginine", "Arg", "CCCCNC(N)=N"], ["Asparagine", "Asn", "CCC(N)=O"], ["Aspartic acid", "Asp", "CCC(=O)O"],
  ["Cysteine", "Cys", "CCS"], ["Glutamine", "Gln", "CCCC(N)=O"], ["Glutamic acid", "Glu", "CCCC(=O)O"], ["Glycine", "Gly", "C[H]"],
  ["Histidine", "His", "CCc1c[nH]cn1"], ["Isoleucine", "Ile", "CC(C)CC"], ["Leucine", "Leu", "CCC(C)C"], ["Lysine", "Lys", "CCCCCN"],
  ["Methionine", "Met", "CCCSC"], ["Phenylalanine", "Phe", "CCc1ccccc1"], ["Proline", "Pro", "CC1CCCN1C"], ["Serine", "Ser", "CCO"], ["Threonine", "Thr", "CC(C)O"],
  ["Tryptophan", "Trp", "CCc1c[nH]c2ccccc12"], ["Tyrosine", "Tyr", "CCc1ccc(O)cc1"], ["Valine", "Val", "CC(C)C"],
];
const sideChains = () => SIDE_CHAINS.map(([name, code, smiles]) => {
  const m = asMol(laidOut(smiles));
  m.atoms[0] = { ...m.atoms[0], label: "C", text: "R" };
  if (code === "Pro") m.atoms[m.atoms.length - 1] = { ...m.atoms[m.atoms.length - 1], label: "C", text: "R" };
  if (clashes(m).length) fail(`${name} side chain: labels clash`);
  return entry(`${name} side chain`, `${code}, amino acid, residue`, { mol: m });
});
// Peptide backbones of n residues, H2N at the left and CO2H at the right, the α carbons L (as in L-alanine) with
// R1 to Rn on them in order.
const PEPTIDES = [[2, "Dipeptide"], [3, "Tripeptide"], [4, "Tetrapeptide"], [5, "Pentapeptide"]];
const peptides = () => PEPTIDES.map(([n, name]) => {
  const smiles = "N" + Array.from({ length: n }, (_, k) => `[C@@H]([Rb])C(=O)${k < n - 1 ? "N" : "O"}`).join("");
  const m = asMol(laidOut(smiles));
  // Turned so the chain runs left to right (a turn, never a mirror, so the α carbons stay L).
  const end = m.atoms.length - 1, t = -Math.atan2(m.atoms[end].location[1] - m.atoms[0].location[1], m.atoms[end].location[0] - m.atoms[0].location[0]);
  m.atoms = m.atoms.map((a) => { const [x, y] = a.location; return { ...a, location: [r3(x * Math.cos(t) - y * Math.sin(t)), r3(x * Math.sin(t) + y * Math.cos(t)), 0] }; });
  let k = 0;
  m.atoms = m.atoms.map((a) => (a.label === "Rb" ? { ...a, label: "C", text: `R${++k}` } : a));
  return entry(name, `peptide, backbone, ${Array.from({ length: n }, (_, j) => `R${j + 1}`).join(" ")}`, { mol: m });
});

// A hexose's two drawings: in a chair, the one with more substituents equatorial; and the substituents placed must be
// the textbook's (all equatorial in β-D-glucopyranose's 4C1 chair, the D sugars' CH2OH up in a Haworth projection).
const hexoses = [];
for (const [shown, name, form, sugar] of HEXOSES) {
  for (const kind of ["haworth", "chair"]) {
    const found = hexose(form, picker(name), kind) ?? fail(`${shown} (${kind}): no drawing is it`);
    hexoses.push(entry(`${shown} (${kind === "chair" ? "chair" : "Haworth"})`, `${sugar}, ${kind === "chair" ? "chair, conformer" : "Haworth projection"}`, { mol: found.mol }));
    if (kind === "chair") {
      const want = { "β-D-Glucopyranose": 5, "α-D-Glucopyranose": 4, "β-D-Galactopyranose": 4, "α-D-Galactopyranose": 3, "β-D-Mannopyranose": 4, "α-D-Mannopyranose": 3 }[shown];
      if (found.equatorial !== want) fail(`${shown}: ${found.equatorial} groups equatorial, not ${want}`);
    }
  }
}
for (const [shown, name, form, kind] of FRUCTOSES) {
  const found = hexose(form, picker(name), kind) ?? fail(`${shown}: no drawing is it`);
  hexoses.push(entry(`${shown} (${kind === "chair" ? "chair" : "Haworth"})`, `fructose, ${kind === "chair" ? "chair, conformer" : "Haworth projection"}`, { mol: found.mol }));
}
const fischers = FISCHER.map(([shown, top, n, group, bottom, name, also]) => {
  const mol = picker(name)(fischerWays(top, n, group, bottom)) ?? fail(`${shown}: no drawing is it`);
  return entry(shown, also, { mol });
});
// D-glucose: OH right, left, right, right down the chain (C2 to C5), as every textbook has it.
{
  const glc = fischers.find((x) => x.name === "D-Glucose (Fischer)").mol, sides = glc.atoms.filter((a) => a.label === "O" && !a.text).sort((a, b) => b.location[1] - a.location[1]).map((a) => (a.location[0] > 0 ? "R" : "L")).join("");
  if (sides !== "RLRR") fail(`D-glucose (Fischer) has its OH ${sides}`);
}

out.push({ name: "Amino acids", items: named("Amino acids") });
out.push({ name: "Side chains", items: sideChains() });
out.push({ name: "Peptides", items: peptides() });
out.push({ name: "Sugars", items: named("Sugars") });
out.push({ name: "Hexoses", items: hexoses });
const bases = nucleobases();
out.push({ name: "Nucleobases", items: bases });
out.push({ name: "DNA and RNA", items: [...named("DNA and RNA"), ...basePairs(bases)] });
// The generic stereocentres first, then the named compounds.
out.push({ name: "Stereocentres", items: [...stereocentres(), ...named("Stereocentres"), ...fischers] });
out.push({ name: "Conformers", items: conformers() });
out.push({ name: "Cycloalkanes", items: named("Cycloalkanes") });
out.push({ name: "Aromatics", items: named("Aromatics") });
out.push({ name: "Bicyclics", items: [...named("Bicyclics"), entry("Cubane", "", { mol: cube() })] });
out.push({ name: "Heterocycles", items: named("Heterocycles") });
out.push({ name: "Functional groups", items: GROUPS.map(([name, smiles, also]) => {
  const m = asMol(laidOut(smiles.replace("X", "[Cl]")));
  // The first atom is R, where the group joins; X is any halogen.
  m.atoms[0] = { ...m.atoms[0], label: "C", text: "R" };
  if (smiles.includes("X")) m.atoms[1] = { ...m.atoms[1], label: "C", text: "X" };
  // A carbon between two double bonds (N=C=O) shows its C, or the two bonds read as one long one.
  m.atoms.forEach((a, i) => { if (a.label === "C" && !a.text && m.bonds.filter((b) => b.type === 2 && b.atoms.includes(i)).length === 2) m.atoms[i] = { ...a, shown: true }; });
  return entry(name, also, { mol: m });
}) });
out.push({ name: "Ligands", items: [...named("Ligands"), DPPF] });
if (hostLengths().some((l) => Math.abs(l - 1) > 0.02)) fail("[2.2]paracyclophane: a bond is not one bond length");
out.push({ name: "Supramolecules", items: [...named("Supramolecules"), ...HOSTS] });
out.push({ name: "Polyhedra", items: POLYHEDRA });
out.push({ name: "Carbon", items: CARBON });
out.push({ name: "Cp and arene rings", items: CP_RINGS });
out.push({ name: "Metallocenes", items: METALLOCENES });
out.push({ name: "Paddlewheels", items: PADDLEWHEELS.map(([name, metal, r, more]) => entry(name, more.also, { mol: paddlewheel(metal, r, more) })) });
out.push({ name: "Lab", items: [...LAB, TLC, ...GLASSWARE] });
out.push({ name: "Lab equipment", items: EQUIPMENT });
out.push({ name: "Biomolecules", items: BIOMOLECULES });
out.push({ name: "Cells", items: CELLS });
out.push({ name: "BioArt", items: BIOART });
out.push({ name: "Anatomy", items: ANATOMY });
out.push({ name: "Organisms", items: ORGANISMS });
out.push({ name: "Bugs", items: BUGS });
out.push({ name: "Symbols", items: SYMBOLS });

// --keep-shipped: the sets released in 1.1 keep their templates as src/library.json has them, so building the new
// sets does not redraw a released one (later changes to Clean Up and the chair would move some atoms). Lab is built
// again: its first 16 items come out the same, and lab.check.ts checks them.
const SHIPPED = ["Amino acids", "Sugars", "Hexoses", "Nucleobases", "Stereocentres", "Conformers", "Cycloalkanes", "Aromatics", "Bicyclics",
  "Heterocycles", "Functional groups", "Ligands", "Cp and arene rings", "Metallocenes", "Paddlewheels"];
if (process.argv.includes("--keep-shipped")) {
  const shipped = new Map(JSON.parse(readFileSync(new URL("src/library.json", root), "utf8")).map((c) => [c.name, c]));
  for (const [k, c] of out.entries()) if (SHIPPED.includes(c.name)) out[k] = shipped.get(c.name) ?? fail(`${c.name} is not in src/library.json`);
}
// Lab's first 16 items are the ones 1.1 shipped; the rest load later, with the new sets.
const FIRST_LAB = 16;
const names = out.flatMap((c) => c.items.map((t) => t.name));
const twice = names.filter((n, k) => names.indexOf(n) !== k);
if (twice.length) fail(`names used twice: ${twice.join(", ")}`);
// Two files: src/library.json, which Octet reads as it starts (the sets and Lab items 1.1 had, so starting is no slower),
// and src/library-more.json, which it loads after (library.ts): the other sets, with their places in the order, and
// the rest of Lab.
const now = out.filter((c) => SHIPPED.includes(c.name) || c.name === "Lab").map((c) => (c.name === "Lab" ? { ...c, items: c.items.slice(0, FIRST_LAB) } : c));
const later = { order: out.map((c) => c.name), sets: out.filter((c) => !SHIPPED.includes(c.name)).map((c) => (c.name === "Lab" ? { ...c, items: c.items.slice(FIRST_LAB) } : c)) };
writeFileSync(new URL("src/library.json", root), JSON.stringify(now) + "\n");
writeFileSync(new URL("src/library-more.json", root), JSON.stringify(later) + "\n");
console.log(`library: ${names.length} templates in ${out.length} sets${failed.length ? `; not read: ${failed.join(", ")}` : ""}`);
