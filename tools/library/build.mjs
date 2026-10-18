// Builds src/library.json, Octet's own template library: each entry's name goes through OPSIN (or its SMILES is
// given), Indigo lays it out, and the drawing is kept at bond length 1, centred. Run: node tools/library/build.mjs
// Everything here is a structure from its systematic or trivial name; nothing comes from another program's files.
// The Lab group (glassware and lamps) is drawn in lab.mjs.
import { readFileSync, writeFileSync } from "node:fs";
import { LAB } from "./lab.mjs";

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

// [shown name, OPSIN name or "smiles:..."]. A shown name alone is read by OPSIN as it is.
const LIBRARY = {
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
  "Nucleobases": [["Adenine"], ["Guanine"], ["Cytosine"], ["Thymine"], ["Uracil"]],
  "Heterocycles": [
    ["Pyridine"], ["Pyrrole", "1H-pyrrole"], ["Furan"], ["Thiophene"], ["Imidazole", "1H-imidazole"], ["Pyrazole", "1H-pyrazole"], ["Oxazole"], ["Thiazole"],
    ["Pyrimidine"], ["Pyrazine"], ["Pyridazine"], ["1,3,5-Triazine"], ["Tetrazole", "1H-tetrazole"], ["Indole", "1H-indole"], ["Benzofuran", "1-benzofuran"],
    ["Benzothiophene", "1-benzothiophene"], ["Quinoline"], ["Isoquinoline"], ["Purine", "7H-purine"], ["Carbazole", "9H-carbazole"],
    ["Piperidine"], ["Piperazine"], ["Morpholine"], ["Pyrrolidine"], ["Tetrahydrofuran", "oxolane"], ["Tetrahydropyran", "oxane"], ["Oxetane"], ["Oxirane"], ["Aziridine"],
  ],
  "Polycyclics": [
    ["Naphthalene"], ["Anthracene"], ["Phenanthrene"], ["Pyrene"], ["Fluorene", "9H-fluorene"], ["Indane", "2,3-dihydro-1H-indene"], ["Tetralin", "1,2,3,4-tetrahydronaphthalene"],
    ["Decalin", "decahydronaphthalene"], ["Norbornane", "bicyclo[2.2.1]heptane"], ["Norbornene", "bicyclo[2.2.1]hept-2-ene"], ["Bicyclo[2.2.2]octane"], ["Adamantane"],
    ["Spiro[4.5]decane"], ["Biphenyl", "1,1'-biphenyl"],
  ],
  "Ligands": [
    ["PPh3", "triphenylphosphane"], ["PCy3", "tricyclohexylphosphane"], ["P(t-Bu)3", "tri-tert-butylphosphane"], ["dppe", "ethane-1,2-diylbis(diphenylphosphane)"],
    ["dppp", "propane-1,3-diylbis(diphenylphosphane)"], ["BINAP", "[1,1'-binaphthalene]-2,2'-diylbis(diphenylphosphane)"],
    ["Xantphos", "(9,9-dimethyl-9H-xanthene-4,5-diyl)bis(diphenylphosphane)"], ["XPhos", "smiles:CC(C)c1cc(C(C)C)c(-c2ccccc2P(C2CCCCC2)C2CCCCC2)c(C(C)C)c1"],
    ["SPhos", "smiles:COc1cccc(OC)c1-c1ccccc1P(C1CCCCC1)C1CCCCC1"], ["bipy", "2,2'-bipyridine"], ["dtbbpy", "4,4'-di-tert-butyl-2,2'-bipyridine"],
    ["phen", "1,10-phenanthroline"], ["terpy", "2,2':6',2''-terpyridine"], ["TMEDA", "N,N,N',N'-tetramethylethane-1,2-diamine"],
    ["cod", "cycloocta-1,5-diene"], ["Cp*H", "1,2,3,4,5-pentamethylcyclopenta-1,3-diene"], ["acacH", "pentane-2,4-dione"],
    ["salen", "smiles:Oc1ccccc1/C=N/CC/N=C/c1ccccc1O"], ["IPr", "smiles:CC(C)c1cccc(C(C)C)c1N1[C]N(c2c(C(C)C)cccc2C(C)C)C=C1"],
    ["DMAP", "N,N-dimethylpyridin-4-amine"], ["DABCO", "1,4-diazabicyclo[2.2.2]octane"], ["pybox", "smiles:C1COC(=N1)c1cccc(n1)C1=NCCO1"],
  ],
};

const opts = new indigo.MapStringString();
opts.set("output-content-type", "application/json");
opts.set("dearomatize-on-load", "true");
const r = (n) => Math.round(n * 1000) / 1000;
const out = [];
const failed = [];
for (const [category, entries] of Object.entries(LIBRARY)) {
  const items = [];
  for (const [shown, source = shown] of entries) {
    let smiles = source.startsWith("smiles:") ? source.slice(7) : "";
    try { if (!smiles) smiles = opsin.parseToSmiles(source); } catch { smiles = ""; }
    if (!smiles) { failed.push(shown); continue; }
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
    items.push({
      name: shown,
      atoms: atoms.map((a) => [a.label, r((a.x - cx) * k), r((a.y - cy) * k), ...(a.charge || a.radical ? [a.charge ?? 0] : []), ...(a.radical ? [a.radical - 1] : [])]),
      bonds,
    });
  }
  out.push({ name: category, items });
}
out.push({ name: "Lab", items: LAB });
writeFileSync(new URL("src/library.json", root), JSON.stringify(out) + "\n");
console.log(`library: ${out.reduce((n, c) => n + c.items.length, 0)} templates${failed.length ? `; not read: ${failed.join(", ")}` : ""}`);
