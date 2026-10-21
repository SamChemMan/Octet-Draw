// Octet's IUPAC namer: substitutive names from a molecular graph, following the IUPAC 2013 recommendations
// (Nomenclature of Organic Chemistry, P-1 to P-6). Clean room: written from the published rules. It names what it
// understands and returns undefined for the rest; the app also checks every name by reading it back with OPSIN.
//
// Covered: acyclic chains; monocyclic rings (carbocycles, benzene, common heterocycles by their retained names);
// fused ring systems with retained names (naphthalene, indole, quinoline and others) with indicated hydrogen, added
// hydrogen and hydro prefixes; ring assemblies of two identical rings (1,1'-biphenyl); principal characteristic groups
// (carboxylic and sulfonic acids, esters, acid halides, amides, nitriles, aldehydes, ketones, alcohols, thiols,
// amines, imines and oximes) as suffixes; everything else as prefixes, nested to any depth; anhydrides, ureas,
// carbamates (also as prefixes: Boc-glycine); phosphanes and their oxides; anions (-oate, -olate, -ide), cations
// (aminium, ring "-ium", -ylium, diazonium, iminium, onium, pyrylium) and zwitterions (P-7); salts, hydrates and
// hydrochlorides; lone atoms, parent hydrides and inorganic species; bicyclic von Baeyer and monospiro rings with
// oxa, thia and aza replacement; R/S and E/Z. Not yet: polycyclic bridged rings (adamantane), fused systems outside
// the table, larger ring assemblies, radicals and other charged atoms. Octet's own name tables cover some of these
// (naming.ts).
import type { Graph } from "./naming.ts";

type Name = { text: string; compound: boolean }; // compound: needs brackets when cited as a prefix

const STEMS = ["", "meth", "eth", "prop", "but", "pent", "hex", "hept", "oct", "non", "dec", "undec", "dodec", "tridec",
  "tetradec", "pentadec", "hexadec", "heptadec", "octadec", "nonadec", "icos"];
const MULT = ["", "", "di", "tri", "tetra", "penta", "hexa", "hepta", "octa", "nona", "deca"];
const MULT_COMPLEX = ["", "", "bis", "tris", "tetrakis", "pentakis", "hexakis", "heptakis", "octakis"];
const HALO: Record<string, string> = { F: "fluoro", Cl: "chloro", Br: "bromo", I: "iodo" };
const VOWEL = /^[aeiouy]/;

// Principal characteristic groups, most senior first (P-41).
// Carbamates are esters and ureas amides of carbonic acid (P-65.2.1, P-66.1.6); halides are acid halides.
// Anions, then cations (aminium and the rest), are senior to every neutral group (P-41, P-72, P-73).
type Ion = "ide" | "carboxylate" | "peroxoate" | "sulfonate" | "sulfinate" | "olate" | "aminide" | "ylium" | "iminium" | "diazonium";
const ANION_KINDS: Ion[] = ["ide", "carboxylate", "peroxoate", "sulfonate", "sulfinate", "olate", "aminide"];
type Kind = Ion | "aminium" | "acid" | "peroxyacid" | "sulfonic" | "anhydride" | "ester" | "carbamate" | "halide" | "sulfonylhalide" | "amide" | "urea" | "nitrile" | "aldehyde" | "ketone" | "alcohol" | "thiol" | "amine" | "imine";
const SENIORITY: Kind[] = [...ANION_KINDS, "aminium", "ylium", "iminium", "diazonium", "acid", "peroxyacid", "sulfonic", "anhydride", "ester", "carbamate", "halide", "sulfonylhalide", "amide", "urea", "nitrile", "aldehyde", "ketone", "alcohol", "thiol", "amine", "imine"];
// Groups whose carbon is counted in a chain name (propanoic acid) but cited as "carbo…" on a ring (cyclohexanecarboxylic acid).
const CARBON_GROUP = new Set<Kind>(["acid", "anhydride", "ester", "halide", "amide", "nitrile", "aldehyde", "carboxylate", "peroxyacid", "peroxoate"]);
const HALIDE: Record<string, string> = { F: "fluoride", Cl: "chloride", Br: "bromide", I: "iodide" };
// Cations of salts (P-65.6.2.2) and their charges.
const CATIONS: Record<string, [string, number]> = { Li: ["lithium", 1], Na: ["sodium", 1], K: ["potassium", 1], Rb: ["rubidium", 1], Cs: ["caesium", 1], Ag: ["silver", 1],
  Mg: ["magnesium", 2], Ca: ["calcium", 2], Sr: ["strontium", 2], Ba: ["barium", 2], Zn: ["zinc", 2] };
// Inorganic anions (IUPAC 2005, IR-5 and IR-8), by their atoms (with hydrogens) and charge. Every name is read back.
const ANIONS: Record<string, string> = {
  "F-1": "fluoride", "Cl-1": "chloride", "Br-1": "bromide", "I-1": "iodide", "H-1": "hydride", "HO-1": "hydroxide", "O-2": "oxide", "S-2": "sulfide",
  "CO3-2": "carbonate", "CHO3-1": "hydrogencarbonate", "O4S-2": "sulfate", "HO4S-1": "hydrogensulfate", "O3S-2": "sulfite", "HO3S-1": "hydrogensulfite",
  "O3S2-2": "thiosulfate", "NO3-1": "nitrate", "NO2-1": "nitrite", "O4P-3": "phosphate", "HO4P-2": "hydrogenphosphate", "H2O4P-1": "dihydrogenphosphate",
  "N3-1": "azide", "CN-1": "cyanide", "CNS-1": "thiocyanate", "ClO4-1": "perchlorate", "ClO-1": "hypochlorite", "IO4-1": "periodate",
  "MnO4-1": "permanganate", "BF4-1": "tetrafluoroborate", "F6P-1": "hexafluorophosphate", "BH4-1": "tetrahydroborate",
};

// Rings Octet knows by name. key: size, then a (aromatic) or s (saturated), then heteroatoms with their lowest locants.
type Ring = { name: string; stem: string; aromatic: boolean; hydrogen?: string };
const RINGS: Record<string, Ring> = {
  "6a:": { name: "benzene", stem: "phenyl", aromatic: true },
  "6a:N1": { name: "pyridine", stem: "pyridin", aromatic: true },
  "6a:N1,N2": { name: "pyridazine", stem: "pyridazin", aromatic: true },
  "6a:N1,N3": { name: "pyrimidine", stem: "pyrimidin", aromatic: true },
  "6a:N1,N4": { name: "pyrazine", stem: "pyrazin", aromatic: true },
  "6a:N1,N3,N5": { name: "1,3,5-triazine", stem: "1,3,5-triazin", aromatic: true },
  "5a:O1": { name: "furan", stem: "furan", aromatic: true },
  "5a:S1": { name: "thiophene", stem: "thiophen", aromatic: true },
  "5a:N1": { name: "pyrrole", stem: "pyrrol", aromatic: true, hydrogen: "1H-" },
  "5a:N1,N3": { name: "imidazole", stem: "imidazol", aromatic: true, hydrogen: "1H-" },
  "5a:N1,N2": { name: "pyrazole", stem: "pyrazol", aromatic: true, hydrogen: "1H-" },
  "5a:O1,N3": { name: "1,3-oxazole", stem: "1,3-oxazol", aromatic: true },
  "5a:S1,N3": { name: "1,3-thiazole", stem: "1,3-thiazol", aromatic: true },
  "5a:O1,N2": { name: "1,2-oxazole", stem: "1,2-oxazol", aromatic: true },
  "5a:S1,N2": { name: "1,2-thiazole", stem: "1,2-thiazol", aromatic: true },
  "6s:N1": { name: "piperidine", stem: "piperidin", aromatic: false },
  "6s:O1": { name: "oxane", stem: "oxan", aromatic: false },
  "6s:S1": { name: "thiane", stem: "thian", aromatic: false },
  "6s:N1,N4": { name: "piperazine", stem: "piperazin", aromatic: false },
  "6s:O1,N4": { name: "morpholine", stem: "morpholin", aromatic: false },
  "6s:O1,O4": { name: "1,4-dioxane", stem: "1,4-dioxan", aromatic: false },
  "6s:O1,O3": { name: "1,3-dioxane", stem: "1,3-dioxan", aromatic: false },
  "5s:N1": { name: "pyrrolidine", stem: "pyrrolidin", aromatic: false },
  "5s:O1": { name: "oxolane", stem: "oxolan", aromatic: false },
  "5s:S1": { name: "thiolane", stem: "thiolan", aromatic: false },
  "5s:O1,O3": { name: "1,3-dioxolane", stem: "1,3-dioxolan", aromatic: false },
  "4s:O1": { name: "oxetane", stem: "oxetan", aromatic: false },
  "4s:N1": { name: "azetidine", stem: "azetidin", aromatic: false },
  "3s:O1": { name: "oxirane", stem: "oxiran", aromatic: false },
  "3s:N1": { name: "aziridine", stem: "aziridin", aromatic: false },
};
// Ring cations named as a whole (P-73.1.1.2): an aromatic six-membered ring with O+ or S+.
const ION_RINGS: Record<string, Ring> = { "6a:O1": { name: "pyrylium", stem: "", aromatic: true }, "6a:S1": { name: "thiopyrylium", stem: "", aromatic: true } };
const HETERO_ORDER = ["O", "S", "N"]; // heteroatoms in order of seniority for low locants (P-31.1.4.2.4)

// Fused ring parents (P-25.1, P-25.2.1). Each skeleton is its ring bonds by locant; atoms are kept in locant order
// (4 < 4a < 5), so index order is locant order. Each name gives its heteroatoms by locant. Indicated hydrogen is
// worked out from the structure (1H-indole, 9H-purine), so names here are without it.
const SKELETONS: Record<string, string> = {
  naphthalene: "1-2 2-3 3-4 4-4a 4a-5 5-6 6-7 7-8 8-8a 8a-1 4a-8a",
  indene: "1-2 2-3 3-3a 3a-4 4-5 5-6 6-7 7-7a 7a-1 3a-7a",
  anthracene: "1-2 2-3 3-4 4-4a 4a-10 10-10a 10a-5 5-6 6-7 7-8 8-8a 8a-9 9-9a 9a-1 4a-9a 8a-10a",
  phenazine: "1-2 2-3 3-4 4-4a 4a-5 5-5a 5a-6 6-7 7-8 8-9 9-9a 9a-10 10-10a 10a-1 4a-10a 5a-9a",
  phenanthrene: "1-2 2-3 3-4 4-4a 4a-4b 4b-5 5-6 6-7 7-8 8-8a 8a-9 9-10 10-10a 10a-1 4a-10a 4b-8a",
  fluorene: "1-2 2-3 3-4 4-4a 4a-4b 4b-5 5-6 6-7 7-8 8-8a 8a-9 9-9a 9a-1 4a-9a 4b-8a",
  purine: "1-2 2-3 3-4 4-5 5-6 6-1 5-7 7-8 8-9 9-4",
};
const FUSED_NAMES: [string, string, string][] = [
  ["naphthalene", "naphthalene", ""], ["naphthalene", "quinoline", "N1"], ["naphthalene", "isoquinoline", "N2"],
  ["naphthalene", "quinazoline", "N1 N3"], ["naphthalene", "quinoxaline", "N1 N4"], ["naphthalene", "cinnoline", "N1 N2"],
  ["naphthalene", "phthalazine", "N2 N3"], ["naphthalene", "1,5-naphthyridine", "N1 N5"], ["naphthalene", "1,6-naphthyridine", "N1 N6"],
  ["naphthalene", "1,7-naphthyridine", "N1 N7"], ["naphthalene", "1,8-naphthyridine", "N1 N8"], ["naphthalene", "2,6-naphthyridine", "N2 N6"],
  ["naphthalene", "2,7-naphthyridine", "N2 N7"], ["naphthalene", "pteridine", "N1 N3 N5 N8"],
  ["naphthalene", "1-benzopyran", "O1"], ["naphthalene", "2-benzopyran", "O2"],
  ["indene", "indene", ""], ["indene", "indole", "N1"], ["indene", "isoindole", "N2"], ["indene", "1-benzofuran", "O1"],
  ["indene", "2-benzofuran", "O2"], ["indene", "1-benzothiophene", "S1"], ["indene", "2-benzothiophene", "S2"],
  ["indene", "indazole", "N1 N2"], ["indene", "benzimidazole", "N1 N3"], ["indene", "1,3-benzoxazole", "O1 N3"],
  ["indene", "1,3-benzothiazole", "S1 N3"], ["indene", "1,2-benzoxazole", "O1 N2"], ["indene", "1,2-benzothiazole", "S1 N2"],
  ["anthracene", "anthracene", ""], ["anthracene", "acridine", "N10"], ["phenazine", "phenazine", "N5 N10"],
  ["anthracene", "xanthene", "O10"], ["anthracene", "thioxanthene", "S10"], ["phenazine", "phenoxazine", "O5 N10"],
  ["phenazine", "phenothiazine", "S5 N10"],
  ["phenanthrene", "phenanthrene", ""], ["fluorene", "fluorene", ""], ["fluorene", "carbazole", "N9"],
  ["purine", "purine", "N1 N3 N7 N9"],
];
// Locant order: 4 < 4a < 4b < 5.
const locOrder = (a: string, b: string) => parseInt(a) - parseInt(b) || (a < b ? -1 : a > b ? 1 : 0);
type Fused = { name: string; labels: string[]; el: string[]; adj: number[][]; order: number[]; bonds: number; formula: string; odd: boolean };
const FUSED: Fused[] = FUSED_NAMES.map(([skeleton, name, hetero]) => {
  const pairs = SKELETONS[skeleton].split(" ").map((b) => b.split("-"));
  const labels = [...new Set(pairs.flat())].sort(locOrder);
  const el = labels.map(() => "C");
  for (const h of hetero.split(" ").filter(Boolean)) el[labels.indexOf(h.replace(/^[A-Z]/, ""))] = h[0];
  const adj = labels.map(() => [] as number[]);
  for (const [a, b] of pairs) { adj[labels.indexOf(a)].push(labels.indexOf(b)); adj[labels.indexOf(b)].push(labels.indexOf(a)); }
  // Search order: each atom after the first is bonded to one already placed.
  const order = [0];
  for (let k = 0; k < order.length; k++) for (const j of adj[order[k]]) if (!order.includes(j)) order.push(j);
  const cn = el.filter((e) => e === "C" || e === "N").length;
  return { name, labels, el, adj, order, bonds: pairs.length, formula: [...el].sort().join(""), odd: cn % 2 === 1 };
});
// A fused system in a molecule: the parent's numberings (atom at each locant), its C and N atoms, those with no ring
// double bond (d), and its ring bonds.
type FusedSys = { tpl: Fused; nums: number[][]; cn: number[]; d: number[]; ring: (a: number) => number[] };
// A von Baeyer or spiro ring system: its descriptor (bicyclo[2.2.1], spiro[4.5]), numberings, and ring bonds.
type Bridged = { prefix: string; nums: number[][]; bonds: [number, number][] };
// Replacement prefixes for ring heteroatoms (P-15.4), in order of citation.
const REPLACE: [string, string][] = [["O", "oxa"], ["S", "thia"], ["N", "aza"]];
// A ring assembly (P-28): two identical rings and the single bond joining them.
type Assembly = { rings: [number[], number[]]; junction: [number, number] };
const HYDRO = [...MULT, "undeca", "dodeca", "trideca", "tetradeca"];

// Retained names used in preferred IUPAC names (P-65, P-66, P-63): parent ring or chain, principal group, name.
const RETAINED: Record<string, string> = {
  "benzene:acid": "benzoic acid", "benzene:ester": "benzoate", "benzene:amide": "benzamide", "benzene:nitrile": "benzonitrile",
  "benzene:aldehyde": "benzaldehyde", "benzene:alcohol": "phenol", "benzene:amine": "aniline",
  "C2:acid": "acetic acid", "C2:ester": "acetate", "C2:amide": "acetamide", "C2:nitrile": "acetonitrile", "C2:aldehyde": "acetaldehyde",
  "C1:acid": "formic acid", "C1:ester": "formate", "C1:amide": "formamide", "C1:aldehyde": "formaldehyde",
  "benzene:anhydride": "benzoic acid", "C2:anhydride": "acetic acid", "C1:anhydride": "formic acid",
  "benzene:halide": "benzoyl", "C2:halide": "acetyl", "C1:halide": "formyl",
  "benzene:carboxylate": "benzoate", "C2:carboxylate": "acetate", "C1:carboxylate": "formate", "benzene:olate": "phenolate", "benzene:aminide": "anilinide",
};

class Namer {
  n: number; el: string[]; h: number[]; q: number[]; adj: number[][]; bond = new Map<string, number>();
  inRing: boolean[]; rings: number[][] = []; ringOf: number[];
  fused: boolean[] = []; fusedCache = new Map<number, FusedSys>(); // ring systems that are not a single cycle
  carbonylO: number[]; // the =O on each carbon, or -1
  cip: (string | undefined)[]; cipBond = new Map<string, string>(); // R/S on atoms, E/Z on double bonds
  group: (Kind | undefined)[] = []; // the characteristic group each atom carries or is (functional carbons, O, S, N)
  bearer = new Map<number, number[]>(); // a group's atom (O, S, N or functional C) → the carbons it hangs on
  esterO = new Map<number, number>(); // ester carbon (and carbamate carbon) → its single-bonded O
  sulfur = new Set<number>(); // sulfonyl and sulfinyl S, with their =O and any OH or halogen
  anhydrideO = new Map<number, number>(); // anhydride carbon → its bridging O
  phosphorus = new Set<number>(); // phosphane P, with the =O of a phosphane oxide
  ions = new Set<number>(); ionBonds = new Set<string>(); onium: number[] = []; azanide: number[] = []; // atoms named as ions, their hetero bonds, onium S, P, O, azanide N
  esterIon?: { x: number; word: string; ors: number[]; ohs: number }; // an ester anion of an inorganic acid: methyl sulfate

  constructor(g: Graph) {
    this.n = g.atoms.length;
    this.el = g.atoms.map((a) => a.el);
    this.h = g.atoms.map((a) => a.h);
    this.q = g.atoms.map((a) => a.charge);
    this.adj = g.atoms.map(() => []);
    for (const b of g.bonds) {
      this.adj[b.a].push(b.b);
      this.adj[b.b].push(b.a);
      this.bond.set(this.key(b.a, b.b), b.order);
      if (b.cip) this.cipBond.set(this.key(b.a, b.b), b.cip);
    }
    this.cip = g.atoms.map((a) => a.cip);
    this.inRing = this.findRings();
    this.ringOf = Array(this.n).fill(-1);
    this.rings.forEach((r, k) => r.forEach((i) => (this.ringOf[i] = k)));
    this.carbonylO = Array.from({ length: this.n }, (_, i) =>
      this.el[i] === "C" ? this.adj[i].find((o) => this.el[o] === "O" && this.ord(i, o) === 2 && this.adj[o].length === 1 && !this.q[o]) ?? -1 : -1);
  }
  key = (a: number, b: number) => (a < b ? `${a} ${b}` : `${b} ${a}`);
  ord = (a: number, b: number) => this.bond.get(this.key(a, b)) ?? 0;
  carbons = (i: number, not: number[] = []) => this.adj[i].filter((j) => this.el[j] === "C" && !not.includes(j));

  // Rings: each ring bond lies on a cycle. Ring systems are single cycles (kept in cycle order) or fused systems.
  findRings(): boolean[] {
    const ringBond = (a: number, b: number) => {
      const seen = new Set([a]), stack = [a];
      while (stack.length) {
        const i = stack.pop()!;
        for (const j of this.adj[i]) {
          if ((i === a && j === b) || seen.has(j)) continue;
          if (j === b) return true;
          seen.add(j);
          stack.push(j);
        }
      }
      return false;
    };
    const inRing = Array(this.n).fill(false), edges: [number, number][] = [];
    for (const [k] of this.bond) {
      const [a, b] = k.split(" ").map(Number);
      if (ringBond(a, b)) { inRing[a] = inRing[b] = true; edges.push([a, b]); }
    }
    // Ring systems: each must be one simple cycle (as many ring bonds as ring atoms).
    const seen = new Set<number>();
    for (let s = 0; s < this.n; s++) {
      if (!inRing[s] || seen.has(s)) continue;
      const atoms: number[] = [], stack = [s];
      seen.add(s);
      while (stack.length) {
        const i = stack.pop()!;
        atoms.push(i);
        for (const [a, b] of edges) {
          const j = a === i ? b : b === i ? a : -1;
          if (j >= 0 && !seen.has(j)) { seen.add(j); stack.push(j); }
        }
      }
      const count = edges.filter(([a]) => atoms.includes(a)).length;
      this.fused.push(count !== atoms.length);
      if (count !== atoms.length) { this.rings.push(atoms); continue; }
      // Walk the cycle in order.
      const cycle = [atoms[0]];
      while (cycle.length < atoms.length) {
        const last = cycle[cycle.length - 1], prev = cycle[cycle.length - 2];
        const next = edges.map(([a, b]) => (a === last ? b : b === last ? a : -1)).find((j) => j >= 0 && j !== prev && !cycle.includes(j));
        if (next === undefined) throw new Error("ring walk");
        cycle.push(next);
      }
      this.rings.push(cycle);
    }
    return inRing;
  }

  // Characteristic groups (P-41). Throws for atoms Octet cannot yet name.
  perceive() {
    const { el, h, q, adj } = this;
    this.perceiveIons();
    for (let i = 0; i < this.n; i++) {
      if (!["C", "N", "O", "S", "P", "F", "Cl", "Br", "I"].includes(el[i])) throw new Error(`element ${el[i]}`);
      if (q[i] && !this.nitroAtom(i) && !this.cationN(i) && !this.diazoAtom(i) && !this.azidoAtom(i) && !this.ions.has(i)) throw new Error("charge");
    }
    for (let c = 0; c < this.n; c++) {
      if (el[c] !== "C" || this.group[c] || this.ions.has(c)) continue;
      const o = this.carbonylO[c], cs = this.carbons(c);
      const others = adj[c].filter((j) => j !== o && el[j] !== "C");
      const nitrileN = adj[c].find((j) => el[j] === "N" && this.ord(c, j) === 3 && adj[j].length === 1);
      if (nitrileN !== undefined) {
        if (this.inRing[c] || cs.length > 1 || others.length !== 1) throw new Error("nitrile");
        this.mark(c, "nitrile", cs);
        this.group[nitrileN] = "nitrile";
        continue;
      }
      // Imines and oximes (P-62.3.1.1, P-68.3.1.1.1): C=N, the N bearing H, a carbon or an O (N-hydroxy, N-alkoxy).
      const n = this.imineN(c);
      if (n !== undefined) {
        if (o >= 0 || others.some((j) => j !== n) || this.fused[this.ringOf[c]]) throw new Error("imine");
        this.mark(c, "imine", cs);
        this.group[n] = "imine";
        continue;
      }
      if (o < 0) continue;
      this.group[o] = "ketone"; // the =O belongs to whichever group its carbon is
      // A ring carbonyl is a ketone, between ring carbons or ring heteroatoms alike: lactams and lactones are named as
      // heterocyclic ketones (P-65.6.5, P-66.1.4): pyrrolidin-2-one, quinolin-2(1H)-one.
      if (this.inRing[c]) {
        if (!adj[c].every((j) => j === o || this.ringOf[j] === this.ringOf[c])) throw new Error("carbonyl");
        this.mark(c, "ketone", cs);
        continue;
      }
      if (others.length === 0) {
        if (cs.length === 2) this.mark(c, "ketone", cs);
        else if (!this.inRing[c] && h[c] >= 1) this.mark(c, "aldehyde", cs);
        else throw new Error("carbonyl");
        continue;
      }
      // Carbonic acid derivatives (P-65.2.1): urea and its N-substituted forms, and carbamate esters.
      const plainN = (n: number) => el[n] === "N" && this.ord(c, n) === 1 && !this.inRing[n] && adj[n].every((j) => j === c || (el[j] === "C" && this.carbonylO[j] < 0 && !this.isNitrileC(j)));
      const esterOf = (x: number) => el[x] === "O" && adj[x].length === 2 && adj[x].every((j) => j === c || (el[j] === "C" && this.carbonylO[j] < 0));
      if (others.length === 2 && !cs.length) {
        const ns = others.filter(plainN), os = others.filter(esterOf);
        if (ns.length === 2) { this.mark(c, "urea", []); ns.forEach((n) => (this.group[n] = "urea")); }
        else if (ns.length === 1 && os.length === 1) { this.mark(c, "carbamate", []); this.group[ns[0]] = this.group[os[0]] = "carbamate"; this.esterO.set(c, os[0]); }
        else throw new Error("carbonic acid derivative");
        continue;
      }
      if (this.inRing[c] || others.length !== 1 || cs.length > 1) throw new Error("carbonyl");
      const x = others[0];
      if (HALO[el[x]] && adj[x].length === 1) { this.mark(c, "halide", cs); this.group[x] = "halide"; continue; }
      const y = el[x] === "O" && adj[x].length === 2 ? adj[x].find((j) => j !== c)! : -1;
      if (y >= 0 && el[y] === "C" && this.carbonylO[y] >= 0 && !this.inRing[y]) { this.mark(c, "anhydride", cs); this.group[x] = "anhydride"; this.anhydrideO.set(c, x); continue; }
      if (el[x] === "O" && h[x] === 1 && adj[x].length === 1) { this.mark(c, "acid", cs); this.group[x] = "acid"; }
      else if (el[x] === "O" && adj[x].length === 2 && this.carbonylO[adj[x].find((j) => j !== c)!] < 0 && el[adj[x].find((j) => j !== c)!] === "C") {
        this.mark(c, "ester", cs);
        this.esterO.set(c, x);
        this.group[x] = "ester";
      } else if (el[x] === "N" && this.ord(c, x) === 1 && !this.inRing[x] && adj[x].every((j) => j === c || (el[j] === "C" && this.carbonylO[j] < 0 && !this.isNitrileC(j)))) {
        this.mark(c, "amide", cs);
        this.group[x] = "amide";
      } else throw new Error("carbonyl group");
    }
    // Sulfonic acids, sulfonyl halides (P-65.3), and the S of sulfoxides and sulfones (P-63.6), which are prefixes.
    for (let i = 0; i < this.n; i++) {
      if (el[i] !== "S" || this.inRing[i] || this.group[i] || this.sulfur.has(i)) continue;
      const os = adj[i].filter((j) => el[j] === "O" && this.ord(i, j) === 2 && adj[j].length === 1 && !q[j]);
      if (!os.length) continue;
      const cs = this.carbons(i), rest = adj[i].filter((j) => !os.includes(j) && !cs.includes(j));
      if (adj[i].some((j) => this.ord(i, j) === 2 && !os.includes(j)) || cs.some((j) => this.carbonylO[j] >= 0 || this.isNitrileC(j))) throw new Error("sulfur");
      if (os.length === 2 && cs.length === 1 && rest.length === 1 && el[rest[0]] === "O" && h[rest[0]] === 1 && adj[rest[0]].length === 1) this.mark(i, "sulfonic", cs);
      else if (os.length === 2 && cs.length === 1 && rest.length === 1 && HALO[el[rest[0]]] && adj[rest[0]].length === 1) this.mark(i, "sulfonylhalide", cs);
      else if (!(os.length <= 2 && cs.length === 2 && !rest.length)) throw new Error("sulfur");
      if (this.cip[i]) throw new Error("sulfur stereo");
      this.sulfur.add(i);
      for (const j of [...os, ...rest]) this.sulfur.add(j);
    }
    // Phosphanes and phosphane oxides (P-68.3.2): P with three single bonds to carbon or hydrogen, and perhaps =O.
    for (let i = 0; i < this.n; i++) {
      if (el[i] !== "P" || this.ions.has(i)) continue;
      const os = adj[i].filter((j) => el[j] === "O" && this.ord(i, j) === 2 && adj[j].length === 1 && !q[j]), rest = adj[i].filter((j) => !os.includes(j));
      if (this.inRing[i] || q[i] || os.length > 1 || rest.length + h[i] !== 3 || rest.some((j) => el[j] !== "C" || this.ord(i, j) !== 1 || this.carbonylO[j] >= 0) || this.cip[i]) throw new Error("phosphorus");
      this.phosphorus.add(i);
      for (const j of os) this.phosphorus.add(j);
    }
    for (let i = 0; i < this.n; i++) {
      if (this.group[i] || this.sulfur.has(i) || this.phosphorus.has(i) || el[i] === "C" || this.inRing[i] || this.ions.has(i)) continue;
      const cs = this.carbons(i);
      if (HALO[el[i]]) { if (adj[i].length !== 1 || cs.length !== 1) throw new Error("halogen"); continue; }
      if (el[i] === "O" && adj[i].some((j) => this.group[j] === "imine") && adj[i].length - cs.length === 1 && adj[i].length <= 2) continue; // an oxime's O: N-hydroxy, N-alkoxy
      if (el[i] === "O") {
        if (adj[i].length === 1 && h[i] === 1 && cs.length === 1) this.mark(i, "alcohol", cs);
        else if (!(adj[i].length === 2 && cs.length === 2) && !this.nitroAtom(i)) throw new Error("oxygen");
      } else if (el[i] === "S") {
        if (adj[i].length === 1 && h[i] === 1 && cs.length === 1) this.mark(i, "thiol", cs);
        else if (!(adj[i].length === 2 && cs.length === 2)) throw new Error("sulfur");
      } else if (el[i] === "N") {
        if (this.nitroAtom(i) || this.diazoAtom(i) || this.azidoAtom(i)) continue;
        if (this.cationN(i)) {
          if (!cs.length || cs.some((j) => this.carbonylO[j] >= 0 || this.isNitrileC(j))) throw new Error("cation");
          this.mark(i, "aminium", cs);
          continue;
        }
        if (cs.length !== adj[i].length || adj[i].some((j) => this.ord(i, j) !== 1) || cs.some((j) => this.carbonylO[j] >= 0 || this.isNitrileC(j))) throw new Error("nitrogen");
        this.mark(i, "amine", cs);
      }
    }
    // Ring heteroatoms are part of the ring's name, ring bonds between them too (pyrazole, cinnoline); any other
    // heteroatom bonded to another heteroatom is not covered.
    for (const [k, o] of this.bond) {
      const [a, b] = k.split(" ").map(Number);
      if ((this.inRing[a] && this.ringOf[a] === this.ringOf[b]) || (this.sulfur.has(a) && this.sulfur.has(b)) || this.ionBonds.has(k)) continue;
      const oxime = (x: number, y: number) => this.group[x] === "imine" && el[x] === "N" && el[y] === "O" && o === 1;
      const oxide = this.phosphorus.has(a) && this.phosphorus.has(b);
      const n2 = (this.diazoAtom(a) && this.diazoAtom(b)) || (this.azidoAtom(a) && this.azidoAtom(b));
      if (el[a] !== "C" && el[b] !== "C" && !this.nitroBond(a, b) && !oxime(a, b) && !oxime(b, a) && !oxide && !n2) throw new Error(`hetero bond ${el[a]}${o}${el[b]}`);
    }
  }
  mark(i: number, kind: Kind, on: number[]) { this.group[i] = kind; this.bearer.set(i, on); }
  isNitrileC = (c: number) => this.adj[c].some((j) => this.el[j] === "N" && this.ord(c, j) === 3);
  nitroAtom(i: number): boolean {
    if (this.el[i] !== "N" && this.el[i] !== "O") return false;
    const n = this.el[i] === "N" ? i : this.adj[i].find((j) => this.el[j] === "N");
    if (n === undefined || this.el[n] !== "N" || this.q[n] !== 1) return false;
    const os = this.adj[n].filter((j) => this.el[j] === "O");
    return os.length === 2 && os.some((o) => this.ord(n, o) === 2 && !this.q[o]) && os.some((o) => this.ord(n, o) === 1 && this.q[o] === -1)
      && this.adj[n].length === 3 && this.carbons(n).length === 1;
  }
  nitroBond = (a: number, b: number) => this.nitroAtom(a) && this.nitroAtom(b);
  // The N=N+ end of a diazo or azido group: N+ with a terminal =N- and one more double bond, to x.
  private n2End(mid: number): number | undefined {
    if (this.el[mid] !== "N" || this.q[mid] !== 1 || this.h[mid] || this.adj[mid].length !== 2) return undefined;
    const end = this.adj[mid].find((j) => this.el[j] === "N" && this.q[j] === -1 && !this.h[j] && this.adj[j].length === 1 && this.ord(mid, j) === 2);
    if (end === undefined) return undefined;
    const x = this.adj[mid].find((j) => j !== end)!;
    return this.ord(mid, x) === 2 ? x : undefined;
  }
  // Diazo (P-61.4): C=N+=N- on a carbon outside a ring, cited only as the prefix diazo. True for its two N.
  diazoAtom(i: number): boolean {
    if (this.el[i] !== "N") return false;
    const mid = this.q[i] === 1 ? i : this.adj[i].find((j) => this.q[j] === 1);
    const c = mid === undefined ? undefined : this.n2End(mid);
    return c !== undefined && this.el[c] === "C" && !this.inRing[c];
  }
  // Azido (P-61.5): C-N=N+=N-, cited only as the prefix azido. True for its three N.
  azidoAtom(i: number): boolean {
    if (this.el[i] !== "N") return false;
    const mids = this.q[i] === 1 ? [i] : this.adj[i].filter((j) => this.el[j] === "N" && this.q[j] === 1);
    for (const mid of mids) {
      const n = this.n2End(mid);
      if (n === undefined || this.el[n] !== "N" || this.q[n] || this.h[n] || this.adj[n].length !== 2) continue;
      const c = this.adj[n].find((j) => j !== mid)!;
      if (this.el[c] === "C" && this.ord(n, c) === 1) return true;
    }
    return false;
  }
  // A positive N with four bonds counting hydrogens: an aminium N (single bonds) or a ring N of an "-ium" cation.
  cationN(i: number): boolean {
    if (this.el[i] !== "N" || this.q[i] !== 1 || this.nitroAtom(i)) return false;
    const valence = this.adj[i].reduce((t, j) => t + this.ord(i, j), 0) + this.h[i];
    return valence === 4 && (this.inRing[i] ? this.adj[i].every((j) => this.ord(i, j) === 1 || this.ringOf[j] === this.ringOf[i]) : this.adj[i].every((j) => this.ord(i, j) === 1));
  }
  // The N of a C=N imine on carbon c: not in a ring, with H, one carbon (not a carbonyl) or one O.
  imineN(c: number): number | undefined {
    const n = this.adj[c].find((j) => this.el[j] === "N" && this.ord(c, j) === 2);
    if (n === undefined || this.inRing[n] || this.q[n]) return undefined;
    const rest = this.adj[n].filter((j) => j !== c);
    if (rest.length + this.h[n] !== 1) return undefined;
    const x = rest[0];
    if (x === undefined) return n;
    if (this.ord(n, x) !== 1) return undefined;
    if (this.el[x] === "C" && this.carbonylO[x] < 0 && !this.isNitrileC(x)) return n;
    if (this.el[x] === "O" && !this.q[x] && this.adj[x].length + this.h[x] === 2 && this.adj[x].every((j) => j === n || (this.el[j] === "C" && this.carbonylO[j] < 0))) return n;
    return undefined;
  }

  // ——— Ions (P-72 anions, P-73 cations, P-74 zwitterions) ———
  // Charged atoms Octet names, marked before the neutral groups. Anions: carboxylates (-oate), sulfonates, alkoxides
  // and phenoxides (-olate), amine anions (-aminide), carbanions and ring N anions (-ide). Cations: carbocations
  // (-ylium), iminium and diazonium ions, onium ions of S, P and O (trimethylsulfanium), and the O or S of a pyrylium
  // ring. An O- on a cation is cited as oxido (1-oxidopyridin-1-ium). Any other charged atom is left unnamed.
  perceiveIons() {
    const { el, h, q, adj } = this;
    const valence = (i: number) => adj[i].reduce((t, j) => t + this.ord(i, j), 0) + h[i];
    const single = (i: number) => adj[i].every((j) => this.ord(i, j) === 1);
    const plainC = (c: number) => el[c] === "C" && !q[c] && this.carbonylO[c] < 0 && !this.isNitrileC(c);
    const oMinus = (o: number) => el[o] === "O" && q[o] === -1 && !h[o] && adj[o].length === 1 && single(o);
    const terminalO = (x: number, o: number) => el[o] === "O" && !q[o] && adj[o].length === 1 && this.ord(x, o) === 2;
    const ion = (i: number, kind?: Kind, on?: number[]) => { this.ions.add(i); if (kind) this.mark(i, kind, on!); };
    // Peroxides (P-63.3, P-65.1.4): an O-O single bond, cited as hydroperoxy or alkylperoxy, and peroxy acids C(=O)OOH
    // (-peroxoic acid) with their anions (-peroxoate). Their O atoms are kept here, out of the alcohol and ether rules.
    for (const [k, order] of this.bond) {
      const [a, b] = k.split(" ").map(Number), ok = (o: number) => (!q[o] && adj[o].length + h[o] === 2) || (q[o] === -1 && !h[o] && adj[o].length === 1);
      if (order !== 1 || el[a] !== "O" || el[b] !== "O" || this.inRing[a] || this.inRing[b] || !ok(a) || !ok(b)) continue;
      ion(a);
      ion(b);
      this.ionBonds.add(k);
      for (const [x, y] of [[a, b], [b, a]]) {
        const c = adj[x].find((j) => j !== y);
        if (c === undefined || el[c] !== "C" || q[c] || this.inRing[c] || this.carbonylO[c] < 0 || this.carbons(c).length > 1 || adj[c].length !== this.carbons(c).length + 2 || adj[y].length !== 1) continue;
        this.mark(c, q[y] ? "peroxoate" : "peroxyacid", this.carbons(c));
        this.group[x] = this.group[y] = this.group[c];
        this.group[this.carbonylO[c]] = "ketone";
      }
    }
    // A halogen or OH on a ring N is a prefix on the ring: 1-bromopyrrolidine-2,5-dione (NBS),
    // 1-hydroxypyrrolidine-2,5-dione, 4-fluoro-1,4-diazoniabicyclo[2.2.2]octane (Selectfluor).
    for (let i = 0; i < this.n; i++) {
      const n = adj[i][0];
      if (adj[i].length === 1 && !q[i] && el[n] === "N" && this.inRing[n] && this.ord(i, n) === 1 && (HALO[el[i]] || (el[i] === "O" && h[i] === 1))) {
        this.ions.add(i);
        this.ionBonds.add(this.key(i, n));
      }
    }
    for (let i = 0; i < this.n; i++) {
      if (!q[i] || this.nitroAtom(i) || this.diazoAtom(i) || this.azidoAtom(i) || this.ions.has(i)) continue;
      const e = el[i], cs = this.carbons(i);
      if (oMinus(i)) {
        const x = adj[i][0];
        if (el[x] === "C" && !q[x] && this.carbonylO[x] >= 0 && !this.inRing[x] && this.carbons(x).length <= 1 && adj[x].length === this.carbons(x).length + 2) {
          ion(i);
          this.group[i] = "carboxylate";
          this.mark(x, "carboxylate", this.carbons(x));
          this.group[this.carbonylO[x]] = "ketone";
        } else if (plainC(x)) ion(i, "olate", [x]);
        else if (el[x] === "S" && !q[x] && !this.inRing[x] && (adj[x].length === 4 || adj[x].length === 3) && !this.group[x]) {
          // Sulfonates and sulfinates (P-65.3): C-S(=O)2-O- and C-S(=O)-O-.
          const os = adj[x].filter((o) => terminalO(x, o)), c = adj[x].filter(plainC);
          if (os.length === adj[x].length - 2 && c.length === 1) {
            ion(i);
            this.mark(x, os.length === 2 ? "sulfonate" : "sulfinate", c);
            for (const j of [x, i, ...os]) this.sulfur.add(j);
          }
        }
        // One ester anion per structure: a second one's O- is left unnamed.
        if (!this.ions.has(i) && (el[x] === "S" || el[x] === "P" || el[x] === "C") && !q[x] && !this.inRing[x] && !this.esterIon) {
          // Ester anions of inorganic acids (functional class names, IR-8): dodecyl sulfate, methyl hydrogen phosphate,
          // dimethyl phosphate, methyl carbonate. The rest of x's atoms are =O, O-, OH and O-R.
          const of = (f: (o: number) => boolean) => adj[x].filter((o) => o !== i && f(o));
          const os = of((o) => terminalO(x, o)), minus = [i, ...of(oMinus)], ohs = of((o) => el[o] === "O" && !q[o] && h[o] === 1 && adj[o].length === 1);
          const ors = of((o) => el[o] === "O" && !q[o] && !h[o] && adj[o].length === 2 && this.ord(x, o) === 1 && plainC(adj[o].find((j) => j !== x)!));
          const word = el[x] === "S" ? os.length === 2 && minus.length === 1 && !ohs.length && ors.length === 1 && "sulfate"
            : el[x] === "P" ? os.length === 1 && ors.length && adj[x].length === 4 && "phosphate" : os.length === 1 && minus.length === 1 && ors.length === 1 && !ohs.length && "carbonate";
          if (!word || adj[x].length !== os.length + minus.length + ohs.length + ors.length) continue;
          for (const j of [x, ...minus]) ion(j);
          this.esterIon = { x, word, ors, ohs: ohs.length };
          const set = el[x] === "S" ? this.sulfur : el[x] === "P" ? this.phosphorus : this.ions;
          for (const j of [x, ...os, ...minus, ...ohs, ...ors]) set.add(j);
          for (const o of os) this.group[o] = "ketone";
        }
      } else if (e === "N" && q[i] === -1 && valence(i) === 2 && single(i)) {
        if (this.inRing[i]) { if (!h[i] && adj[i].length === 2) ion(i, "ide", [i]); }
        else if (cs.length && cs.length === adj[i].length && cs.every(plainC)) ion(i, "aminide", cs);
        else {
          // An azanide (P-72.2.2.1) with acyl, sulfonyl and cyano groups: acetyl(phenyl)azanide,
          // bis(trifluoromethanesulfonyl)azanide, dicyanoazanide.
          const acyl = (c: number) => el[c] === "C" && !q[c] && !this.inRing[c] && this.carbonylO[c] >= 0 && this.carbons(c).length <= 1 && adj[c].length === this.carbons(c).length + 2;
          const sulfonyl = (s: number) => el[s] === "S" && !q[s] && !this.inRing[s] && adj[s].length === 4 && adj[s].filter((o) => terminalO(s, o)).length === 2 && adj[s].filter(plainC).length === 1;
          const cyano = (c: number) => el[c] === "C" && !q[c] && adj[c].length === 2 && adj[c].some((n) => el[n] === "N" && !q[n] && adj[n].length === 1 && this.ord(c, n) === 3);
          // Silyl groups (bis(trimethylsilyl)azanide) wait for silicon to be named.
          if (!adj[i].every((j) => plainC(j) || acyl(j) || sulfonyl(j) || cyano(j) || el[j] === "Si")) continue;
          ion(i);
          this.azanide.push(i);
          for (const j of adj[i]) {
            if (cyano(j)) { this.group[j] = "nitrile"; this.group[adj[j].find((n) => n !== i)!] = "nitrile"; }
            if (acyl(j)) { this.ions.add(j); this.group[this.carbonylO[j]] = "ketone"; }
            if (sulfonyl(j)) { for (const k of [j, ...adj[j].filter((o) => terminalO(j, o))]) this.sulfur.add(k); this.ionBonds.add(this.key(i, j)); }
          }
        }
      } else if (e === "C" && Math.abs(q[i]) === 1 && valence(i) === 3 && this.carbonylO[i] < 0 && !this.isNitrileC(i)) ion(i, q[i] < 0 ? "ide" : "ylium", [i]);
      else if (e === "N" && q[i] === 1 && !this.cationN(i) && !this.inRing[i] && !h[i] && adj[i].length === 2) {
        // Diazonium (P-73.1.1.2): C-N+≡N.
        const n2 = adj[i].find((j) => el[j] === "N" && !q[j] && !h[j] && adj[j].length === 1 && this.ord(i, j) === 3), c = adj[i].find(plainC);
        if (n2 === undefined || c === undefined || this.ord(i, c) !== 1) continue;
        ion(i, "diazonium", [c]);
        this.group[n2] = "diazonium";
        this.ionBonds.add(this.key(i, n2));
      } else if (e === "N" && q[i] === 1 && !this.inRing[i] && valence(i) === 4) {
        // Iminium (P-73.1.2): C=N+, the N bearing H, carbons or an O- (a nitrone, N-oxido).
        const c = adj[i].find((j) => this.ord(i, j) === 2);
        if (c === undefined || el[c] !== "C" || q[c] || this.carbonylO[c] >= 0 || adj[i].some((j) => j !== c && (!(plainC(j) || oMinus(j)) || this.ord(i, j) !== 1))) continue;
        ion(i, "iminium", [c]);
      } else if (q[i] === 1 && !this.inRing[i] && (e === "S" || e === "P" || e === "O" || HALO[e]) && single(i) && valence(i) === (e === "P" ? 4 : HALO[e] ? 2 : 3) && cs.length && cs.length === adj[i].length && cs.every((c) => plainC(c) || (q[c] === -1 && valence(c) === 3))) {
        // Onium ions (P-73.1.1.1): trimethylsulfanium, tetraphenylphosphanium, triethyloxidanium, diphenyliodanium.
        ion(i);
        this.onium.push(i);
      } else if (q[i] === 1 && e === "S" && !this.inRing[i] && adj[i].length === 4 && cs.length === 3 && adj[i].some((o) => terminalO(i, o)) && cs.every((c) => plainC(c) || (q[c] === -1 && valence(c) === 3))) {
        // A sulfoxonium ion: trimethyl(oxo)-λ4-sulfanium.
        ion(i);
        this.onium.push(i);
        for (const j of [i, ...adj[i].filter((o) => terminalO(i, o))]) this.sulfur.add(j);
      } else if (e === "B" && q[i] === -1 && single(i) && valence(i) === 4) {
        // A boranuide (P-72.3) with carbon, cyano, alkoxy and acyloxy groups: tetraphenylboranuide, triethylboranuide,
        // cyanoboranuide, tris(acetyloxy)boranuide.
        const cyano = (c: number) => el[c] === "C" && !q[c] && adj[c].length === 2 && adj[c].some((n) => el[n] === "N" && !q[n] && adj[n].length === 1 && this.ord(c, n) === 3);
        const oxy = (o: number) => el[o] === "O" && !q[o] && adj[o].length === 2 && adj[o].every((j) => j === i || (el[j] === "C" && !q[j] && !this.inRing[j]));
        if (!adj[i].every((j) => plainC(j) || cyano(j) || oxy(j))) continue;
        ion(i);
        this.azanide.push(i);
        for (const j of adj[i]) {
          if (cyano(j)) { this.group[j] = "nitrile"; this.group[adj[j].find((n) => n !== i)!] = "nitrile"; }
          if (oxy(j)) { this.ions.add(j); this.ionBonds.add(this.key(i, j)); }
        }
      } else if (q[i] === 1 && (e === "O" || e === "S") && this.inRing[i] && adj[i].length === 2 && !h[i] && adj[i].filter((j) => this.ord(i, j) === 2).length === 1) ion(i); // pyrylium
    }
    // Oxido: an O- on an N+ (amine and ring N-oxides, nitrones) or on an onium ion.
    for (let i = 0; i < this.n; i++) {
      const x = adj[i][0];
      if (!oMinus(i) || this.ions.has(i) || this.nitroAtom(i) || !(this.cationN(x) || this.onium.includes(x) || this.group[x] === "iminium")) continue;
      ion(i);
      this.ionBonds.add(this.key(i, x));
    }
  }
  // Under an ion suffix a carboxylic acid (or a carboxylate under another anion) is cited as carboxy (carboxylato),
  // so its carbon stays out of the parent chain: 3-carboxypropanoate, carboxy-N,N,N-trimethylmethanaminium.
  ionSkip = (kind: Kind | undefined) => (kind && SENIORITY.indexOf(kind) <= SENIORITY.indexOf("diazonium") ? new Set([...this.bearer.keys()].filter((g) => this.group[g] === "acid" || (this.group[g] === "carboxylate" && kind !== "carboxylate" && this.el[g] === "C"))) : undefined);
  // A parent that is an ion as a whole, or must hold the ion: an onium cation (P-73.1.1.1: trimethylsulfanium), an
  // azanide (acetyl(phenyl)azanide), or a ring cation with neutral groups cited as prefixes (3-carbamoyl-1-methylpyridin-1-ium).
  ionParent(kind: Kind | undefined): string | undefined {
    const anion = (ANION_KINDS as (Kind | undefined)[]).includes(kind);
    if (this.esterIon) {
      // The alkyl groups in alphabetical order, then hydrogen: ethyl methyl phosphate, methyl hydrogen phosphate.
      const { x, word, ors, ohs } = this.esterIon;
      if (anion || this.azanide.length) throw new Error("several anions");
      const alkyls = ors.map((o) => this.substituent(this.adj[o].find((j) => j !== x)!, o).text).sort((a, b) => alphaKey(a).localeCompare(alphaKey(b)));
      const words = [...new Set(alkyls)].map((t) => { const k = alkyls.filter((a) => a === t).length; return k < 2 ? t : `${MULT[k]}${t}`; });
      return [...words, ...(ohs ? [`${ohs > 1 ? MULT[ohs] : ""}hydrogen`] : []), word].join(" ");
    }
    if (this.azanide.length) {
      if (anion || this.azanide.length > 1) throw new Error("several anions");
      return this.centre(this.azanide[0]);
    }
    if (anion) return undefined;
    if (this.onium.length) return this.oniumName();
    const rings = new Set([...Array(this.n).keys()].filter((i) => this.inRing[i] && this.q[i] === 1 && (this.cationN(i) || this.ions.has(i))).map((i) => this.ringOf[i]));
    if (!rings.size || !kind || SENIORITY.indexOf(kind) <= SENIORITY.indexOf("diazonium")) return undefined;
    return this.parentName(undefined, undefined, new Set([...rings].flatMap((k) => this.rings[k])))?.text;
  }
  // A radical (fewer bonds and hydrogens than the atom's usual valence: CH2•, O•) is not named here (P-71).
  radicals() {
    for (let i = 0; i < this.n; i++) {
      const e = this.el[i], q = this.q[i], low = e === "C" ? 4 - Math.abs(q) : e === "N" || e === "P" ? 3 + q : e === "O" || e === "S" ? 2 + q : HALO[e] ? 1 + q : undefined;
      if (low !== undefined && this.adj[i].reduce((t, j) => t + this.ord(i, j), 0) + this.h[i] < low) throw new Error("radical");
    }
  }
  // The N of an aminide or iminium group g, whose other substituents are cited with N locants.
  ionN = (kind: Kind | undefined, g: number) => (kind === "aminide" || kind === "iminium" ? g : undefined);
  // Ions cited as prefixes (P-72.6, P-73.6): oxido, carboxylato, sulfonato, and azaniumyl, sulfaniumyl, phosphaniumyl
  // with their substituents ((trimethylazaniumyl)acetate). Other ions are not cited as prefixes.
  ionPrefix(x: number, from: number): Name | undefined {
    const g = this.group[x], el = this.el[x];
    if (this.ions.has(x) && el === "O" && this.q[x] === -1 && this.adj[x].length === 1) return { text: "oxido", compound: false };
    if (g === "carboxylate") return { text: "carboxylato", compound: false };
    if (g === "sulfonate" || g === "sulfinate") return { text: `${g}o`, compound: false };
    if (g === "peroxyacid" && el === "C") return { text: "hydroperoxycarbonyl", compound: true };
    // Hydroperoxy and alkylperoxy (P-63.3): tert-butylperoxy.
    const peroxy = el === "O" && this.ions.has(x) && !this.q[x] ? this.adj[x].find((j) => j !== from && this.el[j] === "O") : undefined;
    if (peroxy !== undefined) {
      if (this.h[peroxy] && this.adj[peroxy].length === 1) return { text: "hydroperoxy", compound: false };
      const r = this.adj[peroxy].find((j) => j !== x)!;
      if (this.el[r] !== "C") throw new Error("peroxide");
      return { text: `${enclose(this.substituent(r, peroxy))}peroxy`, compound: true };
    }
    if (g === "aminium" || this.onium.includes(x)) return { text: `${this.centre(x, from)}yl`, compound: this.adj[x].length > 1 };
    if ((g && (ANION_KINDS as Kind[]).includes(g)) || g === "ylium" || g === "iminium" || g === "diazonium" || (this.ions.has(x) && this.inRing[x])) throw new Error(`${g ?? "ion"} as a prefix`);
    return undefined;
  }
  oniumName(): string {
    if (this.onium.length !== 1) throw new Error("several onium ions");
    return this.centre(this.onium[0]);
  }
  // An onium, azanide or boranuide centre x as a parent, with its substituents (but not the atom `from` it hangs on):
  // trimethylsulfanium, trimethyl(oxo)-λ4-sulfanium, tetraphenylphosphanium, acetyl(phenyl)azanide, triethylboranuide.
  centre(x: number, from = -1): string {
    const el = this.el[x], oxo = this.adj[x].filter((j) => this.ord(x, j) === 2 && this.el[j] === "O");
    const subs = [...this.adj[x].filter((j) => j !== from && !oxo.includes(j)).map((j) => this.substituent(j, x)), ...oxo.map(() => ({ text: "oxo", compound: false }))];
    const word = this.q[x] < 0 ? { N: "azanide", B: "boranuide" }[el] : oxo.length ? "-λ4-sulfanium" : { N: "azanium", S: "sulfanium", P: "phosphanium", O: "oxidanium", I: "iodanium", Br: "bromanium", Cl: "chloranium", F: "fluoranium" }[el];
    if (!word) throw new Error("charge");
    return substituted(subs) + word;
  }

  // ——— Parents ———

  // A ring's identity: retained or cyclo name, and the numberings its heteroatoms allow.
  ringInfo(cycle: number[]): { ring?: Ring; numberings: number[][]; aromatic: boolean; fused?: FusedSys; assembly?: { stem: string; labels: string[]; junction: [number, number] }; bridged?: Bridged } {
    const k = this.ringOf[cycle[0]];
    if (this.fused[k]) {
      let f: FusedSys;
      try { f = this.fusedInfo(k); } catch (e) { const b = this.bridgedInfo(k); if (!b) throw e; return { numberings: b.nums, aromatic: false, bridged: b }; }
      return { numberings: f.nums, aromatic: true, fused: f };
    }
    const size = cycle.length, ringBonds = cycle.map((a, k) => this.ord(a, cycle[(k + 1) % size]));
    const doubles = cycle.map((a) => cycle.some((b) => b !== a && this.ord(a, b) === 2 && this.adjacentIn(cycle, a, b)));
    const hetero = cycle.filter((a) => this.el[a] !== "C");
    const allNumberings: number[][] = [];
    for (let s = 0; s < size; s++) for (const dir of [1, -1]) allNumberings.push(cycle.map((_, k) => cycle[(s + dir * k + size * 2) % size]));
    const aromatic6 = size === 6 && doubles.every(Boolean);
    const aromatic5 = size === 5 && ringBonds.filter((o) => o === 2).length === 2 && cycle.filter((_, k) => !doubles[k]).every((a) => this.el[a] !== "C");
    const aromatic = aromatic6 || aromatic5;
    if (ringBonds.some((o) => o === 3)) throw new Error("ring triple bond");
    if (!hetero.length && !aromatic6) return { numberings: allNumberings, aromatic: false };
    if (!aromatic && ringBonds.some((o) => o === 2)) throw new Error("unsaturated heterocycle");
    // Lowest locants to heteroatoms together, then by seniority O, S, N; then (azoles) to the N bearing hydrogen.
    const heteroLocants = (num: number[]) => num.map((a, k) => (this.el[a] !== "C" ? k + 1 : 0)).filter(Boolean);
    let best = allNumberings;
    best = this.lowest(best, heteroLocants);
    for (const e of HETERO_ORDER) best = this.lowest(best, (num) => num.map((a, k) => (this.el[a] === e ? k + 1 : 0)).filter(Boolean));
    if (aromatic5) best = this.lowest(best, (num) => num.map((a, k) => (this.el[a] !== "C" && !doubles[cycle.indexOf(a)] ? k + 1 : 0)).filter(Boolean));
    const sig = best[0].map((a, k) => (this.el[a] !== "C" ? `${this.el[a]}${k + 1}` : "")).filter(Boolean).sort((x, y) => HETERO_ORDER.indexOf(x[0]) - HETERO_ORDER.indexOf(y[0]) || parseInt(x.slice(1)) - parseInt(y.slice(1)));
    const ring = RINGS[`${size}${aromatic ? "a" : "s"}:${sig.join(",")}`] ?? ION_RINGS[`${size}${aromatic ? "a" : "s"}:${sig.join(",")}`];
    if (!ring) throw new Error("unknown ring");
    return { ring, numberings: best, aromatic };
  }
  // A ring that can be a ring assembly's component: benzene, a retained heterocycle without indicated hydrogen, or a
  // fused system with no saturated atoms (naphthalene, quinoline).
  assemblyComponent(r: number[]): string | undefined {
    const info = this.ringInfo(r);
    if (info.fused) return !info.fused.tpl.odd && !info.fused.d.length ? info.fused.tpl.name : undefined;
    return info.ring?.aromatic && !info.ring.hydrogen ? info.ring.name : undefined;
  }
  // A ring assembly (P-28.2): each ring numbered as itself, the second primed, the junction as low as possible.
  // Locants interleave (1, 1', 2, 2') so that index order is locant order.
  assemblyInfo(asm: Assembly): ReturnType<Namer["ringInfo"]> {
    const [ra, rb] = asm.rings, [ja, jb] = asm.junction, ia = this.ringInfo(ra), ib = this.ringInfo(rb);
    let nums: number[][] = [];
    for (const [x, y] of [[ia, ib], [ib, ia]]) for (const n1 of x.numberings) for (const n2 of y.numberings) nums.push(n1.flatMap((a, k) => [a, n2[k]]));
    nums = this.lowest(nums, (num) => [num.indexOf(ja) + 1, num.indexOf(jb) + 1]);
    const name = this.assemblyComponent(ra)!;
    const stem = name === "benzene" ? "biphenyl" : /^\d/.test(name) ? `bi(${name})` : `bi${name}`;
    return { numberings: nums, aromatic: true, assembly: { stem, labels: ia.fused ? ia.fused.tpl.labels : ra.map((_, k) => String(k + 1)), junction: asm.junction } };
  }
  // A fused system: the table entry whose skeleton maps onto it with the same elements (P-25.3.3: every such map
  // is a numbering the parent allows). Ring bonds may be single or double; hydro prefixes say which.
  fusedInfo(k: number): FusedSys {
    const cached = this.fusedCache.get(k);
    if (cached) return cached;
    const atoms = this.rings[k], sys = new Set(atoms);
    const ringAdj = new Map(atoms.map((a) => [a, this.adj[a].filter((j) => sys.has(j))]));
    const ring = (a: number) => ringAdj.get(a)!;
    // Each C and N has at most one ring double bond, O and S none; no ring triple bonds; the only double bond out of
    // the system is a ring ketone's.
    const cn: number[] = [], d: number[] = [];
    for (const a of atoms) {
      const doubles = ring(a).filter((j) => this.ord(a, j) === 2).length;
      if (doubles > 1 || ring(a).some((j) => this.ord(a, j) === 3)) throw new Error("ring bonds");
      if (this.adj[a].some((j) => !sys.has(j) && this.ord(a, j) > 1 && j !== this.carbonylO[a])) throw new Error("exocyclic double bond");
      // An O+ or S+ with a ring double bond (a pyrylium-like cation) counts as a C here.
      if (this.el[a] === "C" || this.el[a] === "N" || (this.ions.has(a) && this.q[a] === 1)) { cn.push(a); if (!doubles) d.push(a); }
      else if (doubles) throw new Error("ring heteroatom double bond");
    }
    const bonds = atoms.reduce((t, a) => t + ring(a).length, 0) / 2, formula = atoms.map((a) => this.el[a]).sort().join("");
    for (const tpl of FUSED) {
      if (tpl.el.length !== atoms.length || tpl.bonds !== bonds || tpl.formula !== formula) continue;
      const nums = this.match(tpl, atoms, ring);
      if (!nums.length) continue;
      const f = { tpl, nums, cn, d, ring };
      this.fusedCache.set(k, f);
      return f;
    }
    throw new Error("unknown fused ring");
  }
  // Two rings that are not ortho-fused (or fused with no name in the table): a bicyclic von Baeyer system (P-23.2,
  // bicyclo[2.2.1]heptane) or a monospiro system (P-24.2, spiro[4.5]decane), with every numbering the rules allow and
  // then the lowest locants to heteroatoms (P-31.1.4.2.4), which are named by replacement (7-oxa, 1,4-diaza).
  bridgedInfo(k: number): Bridged | undefined {
    const atoms = this.rings[k], sys = new Set(atoms), ring = (a: number) => this.adj[a].filter((j) => sys.has(j));
    const bonds = atoms.flatMap((a) => ring(a).filter((b) => a < b).map((b): [number, number] => [a, b]));
    if (bonds.length !== atoms.length + 1 || atoms.some((a) => !["C", "N", "O", "S"].includes(this.el[a]) || (this.el[a] !== "C" && this.q[a] && !this.cationN(a)))) return undefined;
    if (bonds.some(([a, b]) => this.ord(a, b) === 3)) return undefined;
    // The atoms from `from` (not included) along `start` until `end`.
    const walk = (from: number, start: number, end: number) => {
      const path: number[] = [];
      for (let prev = from, at = start; at !== end; ) { path.push(at); const next = ring(at).find((j) => j !== prev)!; prev = at; at = next; }
      return path;
    };
    const heads = atoms.filter((a) => ring(a).length === 3), spiro = atoms.filter((a) => ring(a).length === 4);
    let nums: number[][] = [], prefix: string;
    if (heads.length === 2 && !spiro.length) {
      // Main ring as large as possible, main bridge as large as possible: bridges by length, longest first. Number
      // from a main bridgehead along the longest bridge, back along the next, then the main bridge from the end
      // nearer to bridgehead 1.
      const [h1, h2] = heads, bridges = ring(h1).map((x) => (x === h2 ? [] : walk(h1, x, h2)));
      const orders = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]].filter((o) => bridges[o[0]].length >= bridges[o[1]].length && bridges[o[1]].length >= bridges[o[2]].length);
      const [x, y, z] = orders[0].map((i) => bridges[i].length);
      // Two rings of five or more sharing a bond take fusion names (P-25.0), so a von Baeyer name is used for them only
      // when they are not aromatic (one ring double bond at most: DBU, bicyclo[4.4.0]dec-1-ene is named by fusion).
      if (!z && y >= 3 && bonds.filter(([a, b]) => this.ord(a, b) === 2).length > 1) return undefined;
      prefix = `bicyclo[${x}.${y}.${z}]`;
      for (const [m, from1] of [[h1, true], [h2, false]] as [number, boolean][]) for (const [a, b, c] of orders) {
        const fwd = (p: number[]) => (from1 ? p : [...p].reverse());
        nums.push([m, ...fwd(bridges[a]), from1 ? h2 : h1, ...[...fwd(bridges[b])].reverse(), ...fwd(bridges[c])]);
      }
    } else if (spiro.length === 1 && !heads.length) {
      // Number from the smaller ring, at an atom next to the spiro atom, round to the spiro atom, then round the other.
      const s = spiro[0], loops: number[][] = [];
      for (const x of ring(s)) if (!loops.some((l) => l.includes(x))) loops.push(walk(s, x, s));
      if (loops.length !== 2) return undefined;
      loops.sort((a, b) => a.length - b.length);
      prefix = `spiro[${loops[0].length}.${loops[1].length}]`;
      const firsts = loops[0].length === loops[1].length ? [0, 1] : [0];
      for (const f of firsts) for (const r1 of [loops[f], [...loops[f]].reverse()]) for (const r2 of [loops[1 - f], [...loops[1 - f]].reverse()]) nums.push([...r1, s, ...r2]);
    } else return undefined;
    nums = this.lowest(nums, (num) => num.map((a, i) => (this.el[a] !== "C" ? i + 1 : 0)).filter(Boolean));
    for (const e of HETERO_ORDER) nums = this.lowest(nums, (num) => num.map((a, i) => (this.el[a] === e ? i + 1 : 0)).filter(Boolean));
    return { prefix, nums, bonds };
  }
  // Every map of the skeleton onto the ring system that keeps elements and bonds, as numberings (the atom at each
  // locant). Atoms and bonds are equal in number, so a map that keeps every skeleton bond is an isomorphism.
  match(tpl: Fused, atoms: number[], ring: (a: number) => number[]): number[][] {
    const out: number[][] = [], map: number[] = tpl.el.map(() => -1), used = new Set<number>();
    let steps = 0;
    const place = (k: number) => {
      if (++steps > 20000) throw new Error("ring match"); // bounded: the app names on every selection
      if (k === tpl.order.length) { out.push([...map]); return; }
      const p = tpl.order[k], placed = tpl.adj[p].filter((q) => map[q] >= 0);
      for (const a of placed.length ? ring(map[placed[0]]) : atoms) {
        if (used.has(a) || this.el[a] !== tpl.el[p] || ring(a).length !== tpl.adj[p].length || !placed.every((q) => this.ord(map[q], a))) continue;
        map[p] = a;
        used.add(a);
        place(k + 1);
        map[p] = -1;
        used.delete(a);
      }
    };
    place(0);
    return out;
  }
  // Indicated hydrogen (P-31.1.4.2.4), added hydrogen (P-31.1.4.3.4) and hydro prefixes for a fused system in one
  // numbering. Every C and N with no ring double bond is accounted for. A parent with an odd number of C and N atoms
  // needs indicated hydrogen: on a lone ketone's carbon (1,3-dihydro-2H-indol-2-one), else on the lowest free or
  // ketone atom (2,3-dihydro-1H-indole, 1H-indole-2,3-dione). Ketones in pairs need nothing more; a ketone left on its
  // own takes added hydrogen from the lowest free atom (naphthalen-1(2H)-one, 1H-isoindole-1,3(2H)-dione). The rest
  // are hydro prefixes, in pairs.
  saturation(f: FusedSys, num: number[], ketones: number[]): { x?: number; y?: number; yOn?: number; hydro: number[] } {
    const byLoc = (l: number[]) => [...l].sort((a, b) => num.indexOf(a) - num.indexOf(b));
    const xs = f.cn.length % 2 ? byLoc(ketones.length % 2 ? ketones : f.d) : [undefined];
    for (const x of xs) {
      const left = ketones.filter((a) => a !== x);
      if (left.length % 2 && left.length > 1) continue;
      const ys = left.length % 2 ? byLoc(f.d.filter((a) => a !== x && !ketones.includes(a))) : [undefined];
      // The parent with its indicated and added hydrogen must exist: the other C and N atoms pair up into double bonds.
      for (const y of ys) {
        const sat = new Set([...ketones, x, y]);
        if (!pairable(f.cn.filter((a) => !sat.has(a)), f.ring)) continue;
        const hydro = byLoc(f.d.filter((a) => !sat.has(a)));
        if (hydro.length % 2) throw new Error("hydro");
        return { x, y, yOn: y === undefined ? undefined : left[0], hydro };
      }
    }
    throw new Error("indicated hydrogen");
  }
  adjacentIn = (cycle: number[], a: number, b: number) => Math.abs(cycle.indexOf(a) - cycle.indexOf(b)) % (cycle.length - 2) === 1 || Math.abs(cycle.indexOf(a) - cycle.indexOf(b)) === 1;
  // The numberings whose locants (from f) are lowest at the first point of difference.
  lowest(nums: number[][], f: (num: number[]) => number[]): number[][] {
    let best: number[][] = [], bestL: number[] | undefined;
    for (const num of nums) {
      const l = f(num).sort((a, b) => a - b), c = bestL ? compare(l, bestL) : -1;
      if (c < 0) { best = [num]; bestL = l; } else if (c === 0) best.push(num);
    }
    return best;
  }

  // ——— Naming a parent with its suffix, prefixes and numbering ———
  // atoms: the parent's chain (in order) or ring (in cycle order). attach: for a substituent, the atom with the free
  // valence and the atom it is joined to. suffix: the principal groups expressed as a suffix.
  nameParent(p: { atoms: number[]; ring: boolean; assembly?: Assembly }, opts: { kind?: Kind; attach?: [number, number]; acyl?: boolean; sulfo?: string; skip?: Set<number> }): Name & { score: number[] } {
    const { atoms } = p, inParent = new Set(atoms), kind = opts.kind;
    const skip = opts.skip ?? new Set<number>();
    const info = p.assembly ? this.assemblyInfo(p.assembly) : p.ring ? this.ringInfo(atoms) : undefined;
    const numberings = p.ring ? info!.numberings : [atoms, [...atoms].reverse()];
    // Suffix sites: the parent atom each principal group sits on (a chain's own functional carbon, or the ring atom
    // a functional carbon hangs on), and the group atoms used up by the suffix.
    const sites: { atom: number; group: number }[] = [];
    const used = new Set<number>();
    if (kind) {
      for (const [g, on] of this.bearer) {
        if (this.group[g] !== kind || skip.has(g)) continue;
        if (CARBON_GROUP.has(kind)) {
          if (inParent.has(g) && !p.ring) sites.push({ atom: g, group: g });
          else if (p.ring && on.some((a) => inParent.has(a))) { sites.push({ atom: on.find((a) => inParent.has(a))!, group: g }); used.add(g); }
        } else if (kind === "ketone" || kind === "imine") { if (inParent.has(g)) { sites.push({ atom: g, group: g }); used.add(kind === "ketone" ? this.carbonylO[g] : this.imineN(g)!); } }
        else { const a = on.find((x) => inParent.has(x)); if (a !== undefined) { sites.push({ atom: a, group: g }); used.add(g); } }
      }
    }
    // A carbanion or carbocation in the parent is its suffix; a pyrylium ring is a parent with no suffix.
    if (atoms.some((a) => (this.group[a] === "ide" || this.group[a] === "ylium") && !sites.some((s) => s.group === a))) throw new Error("ion as a prefix");
    if (info?.ring && Object.values(ION_RINGS).includes(info.ring) && (kind || opts.attach || !atoms.some((a) => this.q[a] === 1))) throw new Error("ring cation");
    // Prefixes: every neighbour outside the parent that the suffix does not use, and N-substituents of an amide or amine suffix.
    const prefixes: { atom: number; name: Name; n?: boolean }[] = [];
    for (const a of atoms) {
      for (const x of this.adj[a]) {
        if (inParent.has(x) || used.has(x) || (opts.attach && x === opts.attach[1] && a === opts.attach[0])) continue;
        if (kind === "ketone" && sites.some((s) => s.atom === a) && x === this.carbonylO[a]) continue;
        if (CARBON_GROUP.has(kind!) && !p.ring && sites.some((s) => s.group === a) && (x === this.carbonylO[a] || this.groupHetero(a).includes(x))) continue;
        if (x === this.carbonylO[a] && !p.ring && opts.acyl && a === atoms[0]) continue; // the acyl group's own =O
        if (x === this.carbonylO[a] || (this.ord(a, x) === 2 && this.el[x] === "O")) { prefixes.push({ atom: a, name: { text: "oxo", compound: false } }); continue; }
        if (this.ord(a, x) === 2 && this.group[x] === "imine") { prefixes.push({ atom: a, name: this.iminoPrefix(x, a) }); continue; }
        prefixes.push({ atom: a, name: this.substituent(x, a) });
      }
    }
    // With several amide or amine suffixes, N-locants name their suffix's locant (N1,N4) and count for numbering.
    for (const s of sites) {
      const nAtom = kind === "amide" ? this.groupHetero(s.group)[0] : kind === "amine" || kind === "aminium" ? s.group : kind === "imine" ? this.imineN(s.group) : this.ionN(kind, s.group);
      if (nAtom === undefined) continue;
      for (const x of this.adj[nAtom]) if (x !== s.group && !inParent.has(x) && x !== s.atom)
        prefixes.push({ atom: s.atom, name: this.substituent(x, nAtom), n: true });
    }
    const manyN = sites.length > 1 && prefixes.some((x) => x.n), counted = prefixes.filter((x) => !x.n || manyN);
    // Choose the numbering (P-31.1.4): indicated hydrogen, then free valence and suffixes, then added hydrogen, then
    // hydro prefixes, multiple bonds and double bonds, then all prefixes, then the prefix cited first in alphabetical order.
    const fused = info?.fused, assembly = info?.assembly, saturation = new Map<number[], ReturnType<Namer["saturation"]>>();
    const sat = (num: number[]) => {
      let v = saturation.get(num);
      if (!v) saturation.set(num, (v = this.saturation(fused!, num, kind === "ketone" ? sites.map((x) => x.atom) : [])));
      return v;
    };
    const bridged = info?.bridged;
    const multiple = (num: number[], o?: number) => bridged ? bridged.bonds.flatMap(([a, b]) => {
      // A double bond between atoms with locants that do not follow on (a bridgehead's) cannot be cited this way.
      const ord = this.ord(a, b), x = loc(num, a), y = loc(num, b);
      return ord > 1 && (o === undefined || ord === o) ? [Math.abs(x - y) === 1 ? Math.min(x, y) : 1000 + Math.min(x, y)] : [];
    }).sort((a, b) => a - b) : num.flatMap((a, k) => {
      const b = num[(k + 1) % num.length];
      if (k === num.length - 1 && !p.ring) return [];
      if (p.ring && info!.aromatic) return [];
      const ord = this.ord(a, b);
      return ord > 1 && (o === undefined || ord === o) ? [k + 1] : [];
    });
    const loc = (num: number[], a: number) => num.indexOf(a) + 1;
    const label = (num: number[], a: number) => {
      const k = num.indexOf(a);
      return assembly ? assembly.labels[k >> 1] + (k & 1 ? "'" : "") : fused ? fused.tpl.labels[k] : String(k + 1);
    };
    const one = (a?: number) => (a === undefined ? [] : [a]);
    let nums = numberings;
    if (fused) nums = this.lowest(nums, (num) => one(sat(num).x).map((a) => loc(num, a)));
    if (opts.attach) nums = this.lowest(nums, (num) => [loc(num, opts.attach![0])]);
    if (opts.acyl) nums = nums.filter((num) => num[0] === atoms[0]);
    nums = this.lowest(nums, (num) => sites.map((s) => loc(num, s.atom)));
    // A ring's cationic centres (-ium) come next, as suffixes do (P-31.1.4.2.4): 6-methylpyrimidin-1-ium.
    if (p.ring) nums = this.lowest(nums, (num) => atoms.filter((a) => this.q[a] === 1 && (this.cationN(a) || this.ions.has(a))).map((a) => loc(num, a)));
    if (fused) {
      nums = this.lowest(nums, (num) => one(sat(num).y).map((a) => loc(num, a)));
      nums = this.lowest(nums, (num) => sat(num).hydro.map((a) => loc(num, a)));
    }
    nums = this.lowest(nums, (num) => multiple(num));
    nums = this.lowest(nums, (num) => multiple(num, 2));
    nums = this.lowest(nums, (num) => counted.map((x) => loc(num, x.atom)));
    const alpha = [...new Set(counted.map((x) => x.name.text))].sort((a, b) => alphaKey(a).localeCompare(alphaKey(b)));
    for (const t of alpha) nums = this.lowest(nums, (num) => counted.filter((x) => x.name.text === t).map((x) => loc(num, x.atom)));
    const num = nums[0];

    // Assemble (P-14, P-16): prefixes in alphabetical order, then the parent, unsaturation and suffix.
    const size = atoms.length;
    const retainedKey = info?.ring ? `${info.ring.name}:${kind}` : !p.ring ? `C${size}:${kind}` : "";
    let retained = kind && !opts.attach && RETAINED[retainedKey];
    // Acetic acid and the like keep their name only without multiple bonds; the suffix site is fixed.
    if (retained && !p.ring && (multiple(num).length || sites.length !== 1)) retained = undefined;
    if (retained && info?.ring && sites.length !== 1) retained = undefined;
    // Suffix locants; added hydrogen goes with its ketone: naphthalen-1(2H)-one.
    const added = fused ? sat(num) : undefined;
    const sitesLoc = sites.map((s) => s.atom).sort((a, b) => loc(num, a) - loc(num, b))
      .map((a) => label(num, a) + (added?.y !== undefined && added.yOn === a ? `(${label(num, added.y)}H)` : ""));
    // Locants are left out where nothing else could be meant (P-14.3.4).
    const single = !p.ring ? size <= 2 && !opts.attach : !fused && !assembly && !bridged && (info?.ring?.name === "benzene" || (!info?.ring && size > 0));
    const prefixText = assemblePrefixes(prefixes.map((x) => ({ loc: x.n ? (manyN ? `N${label(num, x.atom)}` : "N") : label(num, x.atom), name: x.name })),
      (retained && !p.ring && size === 2) || (!p.ring && size === 1) || (single && prefixes.length + sites.length <= 1 && !opts.attach && !multiple(num).length));
    let parent: string;
    if (retained) parent = retained;
    else if (fused) {
      // Hydro prefixes, then indicated hydrogen, in front of the parent (P-31.1.4.2.4): 2,3-dihydro-1H-indole.
      const { x, hydro } = sat(num);
      const h = !hydro.length ? "" : `${hydro.length === fused.cn.length ? "" : hydro.map((a) => label(num, a)).join(",") + "-"}${HYDRO[hydro.length]}hydro`;
      parent = joinPrefixes(h, (x === undefined ? "" : `${label(num, x)}H-`) + fused.tpl.name);
    } else if (assembly) {
      // 1,1'-biphenyl; in brackets before a suffix: [1,1'-biphenyl]-4-carboxylic acid.
      const junction = [...assembly.junction].sort((a, b) => loc(num, a) - loc(num, b)).map((a) => label(num, a)).join(",");
      parent = kind || opts.attach ? `[${junction}-${assembly.stem}]` : `${junction}-${assembly.stem}`;
    } else if (p.ring && info!.ring) parent = (info!.ring.hydrogen && (!opts.attach || opts.sulfo) ? info!.ring.hydrogen : "") + info!.ring.name;
    else if (bridged) {
      if (multiple(num).some((l) => l > 999)) throw new Error("bridgehead double bond");
      // Replacement prefixes in front: 8-azabicyclo[3.2.1]octane, 1,4-dioxaspiro[4.5]decane, and azonia for an N+
      // (P-73.1.2): 1,4-diazoniabicyclo[2.2.2]octane.
      const replaced = [...REPLACE, ["N+", "azonia"]].map(([e, word]) => {
        const at = atoms.filter((a) => (e === "N+" ? this.el[a] === "N" && this.q[a] === 1 : this.el[a] === e && !this.q[a])).map((a) => loc(num, a)).sort((a, b) => a - b);
        return at.length ? `${at.join(",")}-${MULT[at.length]}${word}` : "";
      }).filter(Boolean).join("-");
      parent = (replaced ? `${replaced}${/^\d/.test(bridged.prefix) ? "-" : ""}` : "") + bridged.prefix + chainStem(size, multiple(num, 2), multiple(num, 3), true);
    }
    else parent = (p.ring ? "cyclo" : "") + chainStem(size, multiple(num, 2), multiple(num, 3), p.ring);
    // A ring cation (P-73.1.2): pyridin-1-ium, 1-methylpyridin-1-ium, acridin-10-ium; with an anion suffix,
    // 1-methylpyridin-1-ium-3-carboxylate; as a prefix, pyridin-1-ium-1-yl.
    const ium = p.ring && !bridged ? atoms.filter((a) => this.cationN(a) || (fused && this.ions.has(a) && this.q[a] === 1)) : [];
    if (ium.length) {
      if ((kind && !(ANION_KINDS as Kind[]).includes(kind)) || opts.acyl || opts.sulfo || retained) throw new Error("ring cation");
      parent = `${(opts.attach && info?.ring?.hydrogen) || ""}${parent.replace(/e$/, "")}-${ium.map((a) => label(num, a)).sort(locOrder).join(",")}-${MULT[ium.length]}ium`;
    }
    let text: string;
    const locantFree = p.ring && !fused && !assembly && !bridged && (!info?.ring || info.ring.name === "benzene") && prefixes.length === 0 && !multiple(num).length;
    if (opts.sulfo) text = joinPrefixes(prefixText, withSuffix(parent, undefined, [label(num, opts.attach![0])], p.ring, locantFree, !p.ring && size <= 2, opts.sulfo));
    else if (opts.attach) text = joinPrefixes(prefixText, ium.length ? `${parent}-${label(num, opts.attach[0])}-yl` : this.substituentForm(parent, info, label(num, opts.attach[0]), p.ring, size, !!opts.acyl, multiple(num).length > 0));
    else if (retained) text = prefixText + retained; // benzoic acid, acetic acid: the suffix locant is understood
    else if (kind === "ylium") {
      // Carbocations take the substituent form (P-73.2.1): methylium, propan-2-ylium, cyclohexylium, benzenylium.
      if (sites.length !== 1) throw new Error("several ylium centres");
      const yl = this.substituentForm(parent, info, sitesLoc[0], p.ring, size, false, multiple(num).length > 0);
      text = joinPrefixes(prefixText, (yl === "phenyl" ? (prefixes.length ? `benzen-${sitesLoc[0]}-yl` : "benzenyl") : yl) + "ium");
    }
    else text = joinPrefixes(prefixText, withSuffix(parent, kind, sitesLoc, p.ring, locantFree, !p.ring && size <= 2));
    // Stereodescriptors (P-91, P-93): R and S on the parent's atoms, E and Z on its double bonds, in locant order,
    // in front of everything they belong to.
    const stereo: { at: number; text: string }[] = [];
    for (const a of atoms) if (this.cip[a] === "R" || this.cip[a] === "S") stereo.push({ at: loc(num, a), text: `${label(num, a)}${this.cip[a]}` });
    // E and Z on an imine's C=N, at the carbon's locant: (1E)-N-hydroxyethanimine.
    if (kind === "imine") for (const st of sites) { const c = this.cipBond.get(this.key(st.atom, this.imineN(st.atom)!)); if (c === "E" || c === "Z") stereo.push({ at: loc(num, st.atom), text: `${label(num, st.atom)}${c}` }); }
    if (fused || assembly) {
      if (atoms.some((a) => this.adj[a].some((b) => inParent.has(b) && /^[EZ]$/.test(this.cipBond.get(this.key(a, b)) ?? "")))) throw new Error("ring E/Z");
    } else for (let k = 0; k + 1 < num.length + (p.ring ? 1 : 0); k++) {
      const c = this.cipBond.get(this.key(num[k], num[(k + 1) % num.length]));
      if (c === "E" || c === "Z") stereo.push({ at: k + 1, text: `${k + 1}${c}` });
    }
    if (stereo.length) text = `(${stereo.sort((x, y) => x.at - y.at).map((x) => x.text).join(",")})-${text}`;
    // A prefix needs brackets when it carries prefixes of its own or locants (P-16.5.1).
    return { text, compound: prefixes.length > 0 || /[\d,]/.test(text), score: [] };
  }
  groupHetero = (c: number) => this.adj[c].filter((j) => j !== this.carbonylO[c] && this.el[j] !== "C");

  // The ring or chain stem as a substituent prefix: phenyl, pyridin-3-yl, cyclohexyl, propan-2-yl, acetyl.
  substituentForm(parent: string, info: ReturnType<Namer["ringInfo"]> | undefined, at: string, ring: boolean, size: number, acyl: boolean, unsaturated: boolean): string {
    if (info?.fused) return acyl ? `${parent}-${at}-carbonyl` : `${parent.replace(/e$/, "")}-${at}-yl`; // 1H-indol-3-yl
    if (acyl) {
      if (ring) return parent === "benzene" ? "benzoyl" : `${parent}-${at}-carbonyl`;
      if (size === 2 && parent === "ethane") return "acetyl";
      return parent.replace(/e$/, "") + "oyl";
    }
    if (info?.ring) {
      if (info.ring.name === "benzene") return "phenyl";
      const h = info.ring.hydrogen ? info.ring.hydrogen : "";
      return `${h}${info.ring.stem}-${at}-yl`;
    }
    if (ring) return at === "1" && !unsaturated && !info?.bridged ? parent.replace(/ane$/, "yl") : `${parent.replace(/e$/, "")}-${at}-yl`;
    if (!unsaturated && at === "1") return parent.replace(/ane$/, "yl");
    if (size === 2 && at === "1") return parent.replace(/e$/, "yl"); // ethenyl, ethynyl
    return `${parent.replace(/e$/, "")}-${at}-yl`.replace(/an-(\d+)-yl$/, "an-$1-yl");
  }

  // ——— Substituent prefixes ———
  substituent(x: number, from: number): Name {
    const el = this.el[x];
    // Diazo is the one prefix on a double bond that Octet names (=N+=N-); =CH2 and the like are not covered.
    if (el === "N" && this.diazoAtom(x) && this.ord(x, from) === 2) return { text: "diazo", compound: false };
    if (this.ord(x, from) !== 1) throw new Error("ylidene");
    // Rings with a free valence, on a ring carbon or a ring nitrogen (piperidin-1-yl).
    if (this.inRing[x]) return this.nameParent({ atoms: this.rings[this.ringOf[x]], ring: true }, { attach: [x, from] });
    const ion = this.ionPrefix(x, from);
    if (ion) return ion;
    // Groups Octet does not yet cite as prefixes.
    const g = this.group[x];
    if (g === "anhydride" || g === "halide" || g === "sulfonylhalide" || g === "urea" || g === "aminium" || (g === "carbamate" && el !== "N" && !(el === "O" && this.group[from] === "carbamate"))) throw new Error(`${g} as a prefix`);
    // Phosphanyl and phosphoryl (P-68.3.2.3): diphenylphosphanyl, diphenylphosphoryl.
    if (el === "P") {
      const subs = this.adj[x].filter((j) => j !== from && this.el[j] === "C").map((j) => this.substituent(j, x)), oxide = this.adj[x].some((j) => this.el[j] === "O");
      return { text: `${substituted(subs)}${oxide ? "phosphoryl" : "phosphanyl"}`, compound: subs.length > 0 };
    }
    // Sulfonic acids as sulfo; sulfoxides and sulfones as alkanesulfinyl and alkanesulfonyl (P-63.6, P-65.3.2.3).
    if (this.sulfur.has(x)) {
      if (g === "sulfonic") return { text: "sulfo", compound: false };
      const r = this.adj[x].find((j) => j !== from && this.el[j] === "C")!;
      const sulfo = this.adj[x].filter((j) => this.el[j] === "O").length === 2 ? "sulfonyl" : "sulfinyl";
      const p = this.inRing[r] ? { atoms: this.rings[this.ringOf[r]], ring: true } : { atoms: this.bestChain(r, x), ring: false };
      return { text: this.nameParent(p, { attach: [r, x], sulfo }).text, compound: true };
    }
    if (HALO[el]) return { text: HALO[el], compound: false };
    if (el === "N" && this.nitroAtom(x)) return { text: "nitro", compound: false };
    if (el === "N" && this.azidoAtom(x)) return { text: "azido", compound: false };
    if (el === "O") {
      if (this.adj[x].length === 1) {
        if (this.h[x] === 1) return { text: "hydroxy", compound: false };
        throw new Error("oxygen substituent");
      }
      const r = this.adj[x].find((j) => j !== from)!;
      if (this.carbonylO[r] >= 0) {
        const acyl = this.acylName(r, x);
        return { text: `${acyl.text}oxy`, compound: true };
      }
      const alkyl = this.substituent(r, x);
      const simple: Record<string, string> = { methyl: "methoxy", ethyl: "ethoxy", propyl: "propoxy", butyl: "butoxy", phenyl: "phenoxy", "tert-butyl": "tert-butoxy", benzyl: "benzyloxy", phenylmethyl: "benzyloxy" };
      if (simple[alkyl.text]) return { text: simple[alkyl.text], compound: simple[alkyl.text] === "benzyloxy" };
      return { text: `${enclose(alkyl)}oxy`, compound: true };
    }
    if (el === "S") {
      if (this.adj[x].length === 1 && this.h[x] === 1) return { text: "sulfanyl", compound: false };
      const r = this.adj[x].find((j) => j !== from)!;
      return { text: `${enclose(this.substituent(r, x))}sulfanyl`, compound: true };
    }
    if (el === "N") {
      const others = this.adj[x].filter((j) => j !== from);
      const acyl = others.filter((j) => this.carbonylO[j] >= 0);
      if (acyl.length === 1 && others.length === 1) {
        const a = this.acylName(acyl[0], x).text;
        const retained: Record<string, string> = { acetyl: "acetamido", benzoyl: "benzamido", formyl: "formamido" };
        return { text: retained[a] ?? `${enclose({ text: a, compound: true })}amino`, compound: !retained[a] || true };
      }
      if (acyl.length) throw new Error("imide");
      const subs = others.map((j) => this.substituent(j, x));
      if (!subs.length) return { text: "amino", compound: false };
      if (subs.length === 1) return { text: subs[0].text === "phenyl" ? "anilino" : `${enclose(subs[0])}amino`, compound: true };
      if (subs.length === 2 && subs[0].text === subs[1].text) return { text: `di${enclose(subs[0])}amino`, compound: true };
      const [a, b] = subs.sort((s, t) => alphaKey(s.text).localeCompare(alphaKey(t.text)));
      return { text: `${a.text}(${b.text})amino`, compound: true };
    }
    if (el !== "C") throw new Error("substituent");
    // Functional carbons cited as prefixes.
    const kind = this.group[x];
    if (kind === "acid") return { text: "carboxy", compound: false };
    if (kind === "aldehyde") return { text: "formyl", compound: false };
    if (kind === "nitrile") return { text: "cyano", compound: false };
    if (kind === "amide") {
      const nAtom = this.groupHetero(x)[0], subs = this.adj[nAtom].filter((j) => j !== x).map((j) => this.substituent(j, nAtom));
      if (!subs.length) return { text: "carbamoyl", compound: false };
      const inner = subs.length === 2 && subs[0].text === subs[1].text ? `di${enclose(subs[0])}` : subs.map(enclose).join("");
      return { text: `${inner}carbamoyl`, compound: true };
    }
    if (kind === "ester") {
      const o = this.esterO.get(x)!, r = this.adj[o].find((j) => j !== x)!;
      const alkoxy = this.substituent(o, x); // named from the oxygen
      void r;
      return { text: `${enclose(alkoxy)}carbonyl`.replace(/^\(([a-z-]+oxy)\)carbonyl$/, "$1carbonyl"), compound: true };
    }
    if (this.carbonylO[x] >= 0) return this.acylName(x, from);
    // tert-butyl and benzyl are retained prefixes (P-29.6).
    const methyls = this.carbons(x, [from]).filter((j) => this.h[j] === 3 && this.adj[j].length === 1);
    if (methyls.length === 3 && this.adj[x].length === 4) return { text: "tert-butyl", compound: false };
    const chain = this.bestChain(x, from);
    return this.nameParent({ atoms: chain, ring: false }, { attach: [x, from] });
  }

  // The prefix for =N on a parent atom: imino, (hydroxyimino), (methylimino).
  iminoPrefix(n: number, c: number): Name {
    const x = this.adj[n].find((j) => j !== c);
    return x === undefined ? { text: "imino", compound: false } : { text: `${enclose(this.substituent(x, n))}imino`, compound: true };
  }
  // An acyl group: the carbonyl carbon c joined (at its free valence) to `from`.
  acylName(c: number, from: number): Name {
    // A carbamate's carbon from its N: alkoxycarbonyl (tert-butoxycarbonyl, [(benzyloxy)carbonyl]).
    if (this.group[c] === "carbamate") {
      const o = this.esterO.get(c)!;
      if (this.el[from] !== "N" || from === o) throw new Error("carbamate as a prefix");
      return { text: `${enclose(this.substituent(o, c))}carbonyl`.replace(/^\(([a-z-]+oxy)\)carbonyl$/, "$1carbonyl"), compound: true };
    }
    const r = this.carbons(c, [from]);
    if (!r.length) return { text: "formyl", compound: false };
    if (this.inRing[r[0]]) {
      const cycle = this.rings[this.ringOf[r[0]]];
      return this.nameParent({ atoms: cycle, ring: true }, { attach: [r[0], c], acyl: true });
    }
    const chain = this.bestChain(c, from, true);
    return this.nameParent({ atoms: chain, ring: false }, { attach: [c, from], acyl: true });
  }

  // Acyclic carbon paths (no ring atoms) through or from `start`, not crossing `from`.
  paths(start: number, from: number, fromStart: boolean): number[][] {
    const ok = (j: number) => this.el[j] === "C" && !this.inRing[j] && j !== from;
    const walk = (a: number, seen: Set<number>): number[][] => {
      const next = this.adj[a].filter((j) => ok(j) && !seen.has(j) && (j === start || this.carbonylO[j] < 0 || true));
      const ends = next.flatMap((j) => walk(j, new Set([...seen, j])).map((p) => [j, ...p]));
      return ends.length ? ends : [[]];
    };
    const arms = walk(start, new Set([start]));
    if (!arms.some((a) => !a.length)) arms.push([]); // the path may also end at start
    if (fromStart) return arms.map((p) => [start, ...p]);
    const out: number[][] = [];
    for (const a of arms) for (const b of arms) {
      if (a.length && b.length && a[0] === b[0]) continue;
      out.push([...[...a].reverse(), start, ...b]);
    }
    return out;
  }
  // A substituent's chain (P-29, P-44.3): the longest, then the most multiple bonds, then the most double bonds,
  // then the lowest locant for the free valence, then the most prefixes.
  bestChain(x: number, from: number, fromStart = false): number[] {
    const multiple = (p: number[], o?: number) => p.slice(1).filter((a, k) => { const b = this.ord(p[k], a); return b > 1 && (o === undefined || b === o); }).length;
    const fv = (p: number[]) => Math.min(p.indexOf(x) + 1, p.length - p.indexOf(x));
    const subs = (p: number[]) => p.reduce((s, a) => s + this.adj[a].filter((j) => !p.includes(j) && j !== from).length, 0);
    const score = (p: number[]) => [-p.length, -multiple(p), -multiple(p, 2), fv(p), -subs(p)];
    // A carboxylic acid (or carboxylate) at a chain's end is cited as carboxy (carboxylato), not as part of the chain.
    const own = (p: number[]) => p.filter((a) => a === x || fromStart || (this.group[a] !== "acid" && this.group[a] !== "carboxylate"));
    return this.paths(x, from, fromStart).map(own).sort((a, b) => compare(score(a), score(b)))[0];
  }

  // ——— The whole molecule ———
  name(): string | undefined {
    this.perceive();
    this.radicals();
    if (this.adj.some((a, i) => a.length === 0 && this.el[i] !== "C") || this.n === 0) return undefined;
    const kind = SENIORITY.find((k) => this.group.includes(k) && [...this.bearer.keys()].some((g) => this.group[g] === k));
    let text = this.ionParent(kind);
    if (text) { /* an ion is the parent */ }
    else if (kind === "ester") text = this.esterName();
    else if (kind === "anhydride") text = this.anhydrideName();
    else if (kind === "urea" || kind === "carbamate") text = this.carbonicName(kind);
    else if (!kind && this.phosphorus.size) text = this.phosphaneName();
    else {
      text = this.parentName(kind, this.ionSkip(kind))?.text;
      // Acid halides (P-65.5.1): acetyl chloride, butanedioyl dichloride, methanesulfonyl chloride.
      if (text && (kind === "halide" || kind === "sulfonylhalide")) {
        const xs = [...Array(this.n).keys()].filter((x) => HALO[this.el[x]] && this.adj[x].some((j) => this.group[j] === kind));
        if (new Set(xs.map((x) => this.el[x])).size !== 1) throw new Error("mixed halides");
        text += ` ${MULT[xs.length]}${HALIDE[this.el[xs[0]]]}`;
      }
    }
    // Every stereo label must be cited (P-91): a name that drops one would be wrong, and labels other than R, S, E
    // and Z are not covered.
    // Several azaniumyl groups are bis(azaniumyl): OPSIN reads diazaniumyl as a diazane.
    text = text?.replace(/\b(di|tri|tetra)azaniumyl/g, (_, m: string) => `${MULT_COMPLEX[MULT.indexOf(m)]}(azaniumyl)`);
    const cited = [...(text ?? "").matchAll(/\(([^()]*)\)-/g)].flatMap((m) => m[1].split(",")).filter((t) => /^\d+[a-z]?'*[RSEZ]$/.test(t)).length;
    const labelled = this.cip.filter(Boolean).length + [...this.cipBond.values()].filter(Boolean).length;
    if (text && cited !== labelled) throw new Error("stereo not cited");
    return text;
  }
  // Candidate parents: every acyclic carbon chain and every ring; the senior one wins (P-44).
  parentName(kind: Kind | undefined, skip = new Set<number>(), within?: Set<number>): Name | undefined {
    const carbons = [...Array(this.n).keys()].filter((i) => this.el[i] === "C" && !this.inRing[i] && (!within || within.has(i)) && !skip.has(i));
    const chains: number[][] = [];
    for (const a of carbons) for (const p of this.paths(a, -1, true)) if (p.every((i) => !skip.has(i) && (!within || within.has(i)))) chains.push(p);
    const count = (atoms: number[], ring: boolean) => {
      if (!kind) return 0;
      let c = 0;
      for (const [g, on] of this.bearer) {
        if (this.group[g] !== kind || skip.has(g)) continue;
        if (CARBON_GROUP.has(kind)) c += (!ring && atoms.includes(g)) || (ring && on.some((a) => atoms.includes(a))) ? 1 : 0;
        else if (kind === "ketone" || kind === "imine") c += atoms.includes(g) ? 1 : 0;
        else c += on.some((a) => atoms.includes(a)) ? 1 : 0;
      }
      return c;
    };
    // A chain must not leave out a group carbon that it could include at its end.
    const cands: { atoms: number[]; ring: boolean; groups: number; assembly?: Assembly }[] = [
      ...this.rings.filter((r) => !within || r.every((a) => within.has(a))).map((r) => ({ atoms: r, ring: true, groups: count(r, true) })),
      ...chains.map((c) => ({ atoms: c, ring: false, groups: count(c, false) })),
    ];
    // Ring assemblies (P-28): two identical rings joined by a single bond.
    for (const [k, o] of this.bond) {
      const [a, b] = k.split(" ").map(Number), ra = this.rings[this.ringOf[a]], rb = this.rings[this.ringOf[b]];
      if (o !== 1 || !this.inRing[a] || !this.inRing[b] || ra === rb || (within && ![...ra, ...rb].every((x) => within.has(x)))) continue;
      const name = this.assemblyComponent(ra);
      if (!name || name !== this.assemblyComponent(rb)) continue;
      const atoms = [...ra, ...rb];
      cands.push({ atoms, ring: true, groups: count(atoms, true), assembly: { rings: [ra, rb], junction: [a, b] } });
    }
    if (!cands.length) return undefined;
    const multiple = (c: { atoms: number[]; ring: boolean }, o?: number) => c.ring ? 0 : c.atoms.slice(1).filter((a, k) => { const b = this.ord(c.atoms[k], a); return b > 1 && (o === undefined || b === o); }).length;
    // Senior ring (P-44.2.1.2): has nitrogen; else the senior heteroatom (O, then S); then more rings, more ring
    // atoms, more heteroatoms.
    const ringRank = (c: { atoms: number[] }) => {
      const hetero = c.atoms.filter((a) => this.el[a] !== "C"), set = new Set(c.atoms);
      const has = (e: string) => hetero.some((a) => this.el[a] === e);
      const bonds = c.atoms.reduce((t, a) => t + this.adj[a].filter((j) => set.has(j)).length, 0) / 2;
      return [has("N") ? 0 : has("O") ? 1 : has("S") ? 2 : hetero.length ? 3 : 4, c.atoms.length - 1 - bonds, -c.atoms.length, -hetero.length];
    };
    const subs = (c: { atoms: number[] }) => c.atoms.reduce((s, a) => s + this.adj[a].filter((j) => !c.atoms.includes(j)).length, 0);
    // An assembly ranks by its component ring, then above that ring alone.
    const score = (c: { atoms: number[]; ring: boolean; groups: number; assembly?: Assembly }) =>
      [-c.groups, c.ring ? 0 : 1, ...(c.ring ? [...ringRank({ atoms: c.assembly?.rings[0] ?? c.atoms }), c.assembly ? -2 : -1] : [-c.atoms.length, -multiple(c), -multiple(c, 2), 0, 0]), -subs(c)];
    cands.sort((a, b) => compare(score(a), score(b)));
    const best = cands.filter((c) => compare(score(c), score(cands[0])) === 0);
    // Equal parents: the name with the lowest locants (then first alphabetically) wins.
    const names = best.map((c) => this.nameParent(c, { kind: c.groups ? kind : undefined, skip })).map((n) => n.text);
    names.sort((a, b) => compare(locantsOf(a), locantsOf(b)) || a.localeCompare(b));
    return { text: names[0], compound: true };
  }
  // Everything reachable from c without crossing o.
  side(c: number, o: number): Set<number> {
    const side = new Set<number>([c]), stack = [c];
    while (stack.length) { const i = stack.pop()!; for (const j of this.adj[i]) if (j !== o && !side.has(j)) { side.add(j); stack.push(j); } }
    return side;
  }
  // A phosphane as the parent (P-68.3.2), senior to carbon parents (P-44.1.2): triphenylphosphane,
  // methyl(diphenyl)phosphane, [2-(diphenylphosphanyl)ethyl]diphenylphosphane; with =O, triphenylphosphane oxide.
  // With several P, the shortest name.
  phosphaneName(): string {
    const names = [...this.phosphorus].filter((i) => this.el[i] === "P").map((p) => {
      const subs = this.adj[p].filter((j) => this.el[j] === "C").map((j) => this.substituent(j, p));
      return `${substituted(subs)}phosphane${this.adj[p].some((j) => this.el[j] === "O") ? " oxide" : ""}`;
    });
    return names.sort((a, b) => a.length - b.length || a.localeCompare(b))[0];
  }
  // Esters (P-65.6.3): "alkyl alkanoate", the alkyl named from the ester oxygen's other side.
  esterName(): string | undefined {
    const esters = [...this.esterO.keys()];
    if (esters.length !== 1) throw new Error("several esters");
    const c = esters[0], o = this.esterO.get(c)!, r = this.adj[o].find((j) => j !== c)!;
    const alkyl = this.substituent(r, o);
    // The acid side: everything reachable from the ester carbon without crossing the ester oxygen.
    const acid = this.parentName("ester", new Set(), this.side(c, o));
    if (!acid) return undefined;
    const acidText = acid.text.replace(/oic acid$/, "oate").replace(/carboxylic acid$/, "carboxylate").replace(/ic acid$/, "ate");
    return `${alkyl.text} ${acidText}`;
  }
  // Anhydrides (P-65.7.1): the acids' names, then "anhydride": acetic anhydride, acetic propanoic anhydride.
  anhydrideName(): string {
    const o = new Set(this.anhydrideO.values());
    if (this.anhydrideO.size !== 2 || o.size !== 1) throw new Error("anhydride");
    const acids = [...this.anhydrideO.keys()].map((c) => {
      const acid = this.parentName("anhydride", new Set(), this.side(c, [...o][0]))?.text;
      if (!acid?.endsWith(" acid")) throw new Error("anhydride");
      return acid.slice(0, -5);
    });
    if (acids[0] === acids[1]) return `${acids[0]} anhydride`;
    return `${acids.sort((a, b) => alphaKey(a).localeCompare(alphaKey(b))).join(" ")} anhydride`;
  }
  // Urea and carbamates (P-66.1.6.1, P-65.2.1): N-substituents with locants N and N' (lowest locants, then N for the
  // prefix cited first), and a carbamate's ester alkyl in front: N,N'-dimethylurea, tert-butyl carbamate.
  carbonicName(kind: Kind): string {
    const cs = [...this.bearer.keys()].filter((g) => this.group[g] === kind);
    if (cs.length !== 1) throw new Error("several carbonic groups");
    const c = cs[0], ns = this.groupHetero(c).filter((j) => this.el[j] === "N");
    const prefixes = ns.flatMap((n) => this.adj[n].filter((j) => j !== c).map((j) => ({ n, name: this.substituent(j, n) })));
    let nums = ns.length === 2 ? [ns, [ns[1], ns[0]]] : [ns];
    nums = this.lowest(nums, (num) => prefixes.map((x) => num.indexOf(x.n) + 1));
    for (const t of [...new Set(prefixes.map((x) => x.name.text))].sort((a, b) => alphaKey(a).localeCompare(alphaKey(b))))
      nums = this.lowest(nums, (num) => prefixes.filter((x) => x.name.text === t).map((x) => num.indexOf(x.n) + 1));
    const text = assemblePrefixes(prefixes.map((x) => ({ loc: nums[0].indexOf(x.n) ? "N'" : "N", name: x.name })), false);
    if (kind === "urea") return `${text}urea`;
    const o = this.esterO.get(c)!;
    return `${this.substituent(this.adj[o].find((j) => j !== c)!, o).text} ${text}carbamate`;
  }
}

// ——— Text helpers ———
// Whether the atoms pair up along bonds (a Kekulé structure exists). Bounded search.
function pairable(atoms: number[], bonded: (a: number) => number[]): boolean {
  const free = new Set(atoms);
  let steps = 0;
  const pair = (): boolean => {
    if (++steps > 20000) throw new Error("pairing");
    const a = free.values().next().value;
    if (a === undefined) return true;
    free.delete(a);
    for (const b of bonded(a)) {
      if (!free.has(b)) continue;
      free.delete(b);
      if (pair()) return true;
      free.add(b);
    }
    free.add(a);
    return false;
  };
  return pair();
}
function compare(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] === undefined) return -1;
    if (b[i] === undefined) return 1;
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}
const locantsOf = (name: string) => (name.match(/\d+/g) ?? []).map(Number);
// Alphabetical order ignores multiplying prefixes of simple substituents, locants and italic prefixes (P-14.5).
function alphaKey(t: string): string {
  return t.replace(/^[([{]+/, "").replace(/^((tert|sec|N|\d+[a-z]?'*(,\d+[a-z]?'*)*)-)+/, "").replace(/^(\d+[a-z]?H-)+/, "").replace(/[()[\]{}]/g, "");
}
// Substituents on a parent without locants (amino, phosphane): phenyl, diphenyl, methyl(diphenyl), in alphabetical order.
function substituted(subs: Name[]): string {
  const groups = new Map<string, { name: Name; n: number }>();
  for (const s of subs) groups.set(s.text, { name: s, n: (groups.get(s.text)?.n ?? 0) + 1 });
  const sorted = [...groups.values()].sort((a, b) => alphaKey(a.name.text).localeCompare(alphaKey(b.name.text)));
  const parts = sorted.map((g) => (g.n > 1 ? (g.name.compound ? MULT_COMPLEX[g.n] + enclose(g.name) : MULT[g.n] + g.name.text) : enclose(g.name)));
  // After the first, each substituent goes in brackets: methyl(diphenyl)phosphane, ethyl(methyl)(phenyl)phosphane.
  return parts.map((t, k) => (k === 0 || /^[([{]/.test(t) ? t : `(${t})`)).join("");
}
// Brackets nest ( ), then [ ], then { } (P-16.5).
function enclose(n: Name): string {
  if (!n.compound) return n.text;
  return n.text.includes("[") ? `{${n.text}}` : n.text.includes("(") ? `[${n.text}]` : `(${n.text})`;
}
// Prefixes: grouped by name, multiplied (di, tri; bis, tris for compound names), ordered alphabetically.
function assemblePrefixes(list: { loc: string; name: Name }[], noLocants: boolean): string {
  const groups = new Map<string, { name: Name; locs: string[] }>();
  for (const p of list) {
    const g = groups.get(p.name.text) ?? { name: p.name, locs: [] };
    g.locs.push(p.loc);
    groups.set(p.name.text, g);
  }
  const sorted = [...groups.values()].sort((a, b) => alphaKey(a.name.text).localeCompare(alphaKey(b.name.text)));
  const parts = sorted.map((g) => {
    // N-locants first (N, N', N1, N4), then numerals.
    const isN = (l: string) => l[0] === "N", nKey = (l: string) => "0" + l.slice(1);
    const locs = g.locs.sort((a, b) => (isN(a) !== isN(b) ? (isN(a) ? -1 : 1) : isN(a) ? locOrder(nKey(a), nKey(b)) : locOrder(a, b)));
    const m = g.locs.length, multiplied = m > 1 ? (g.name.compound ? MULT_COMPLEX[m] + enclose(g.name) : MULT[m] + g.name.text) : enclose(g.name);
    return noLocants && !locs.some(isN) ? multiplied : `${locs.join(",")}-${multiplied}`;
  });
  return parts.join("-").replace(/-$/, "") + (parts.length && /\d$|N$/.test(parts[parts.length - 1]) ? "" : "");
}
// Prefixes, then the rest of the name, with a hyphen before a locant: 5-bromo-1H-indole, 1-methyl-1H-pyrrole.
const joinPrefixes = (prefixes: string, rest: string) => (prefixes && /^\d/.test(rest) ? `${prefixes}-${rest}` : prefixes + rest);
// A chain or ring stem with its double and triple bonds: propane, prop-1-ene, buta-1,3-diene, pent-1-en-4-yne.
function chainStem(size: number, enes: number[], ynes: number[], ring: boolean): string {
  const stem = STEMS[size];
  if (!stem) throw new Error("chain too long");
  if (!enes.length && !ynes.length) return stem + "ane";
  const multi = enes.length > 1 || ynes.length > 1;
  let t = stem + (multi ? "a" : "");
  const show = !(size === 2 && !ring) || multi;
  if (enes.length) t += (show ? `-${enes.join(",")}-` : "") + MULT[enes.length] + (ynes.length ? "en" : "ene");
  if (ynes.length) t += (show ? `-${ynes.join(",")}-` : "") + MULT[ynes.length] + "yne";
  return t;
}
// The parent with its suffix: propan-1-ol, propane-1,2-diol, butanedioic acid, cyclohexanecarboxylic acid.
function withSuffix(parent: string, kind: Kind | undefined, locs: string[], ring: boolean, locantFree: boolean, one: boolean, own?: string): string {
  if (!kind && !own) return parent;
  const m = locs.length;
  const base: Record<Kind, [string, string]> = {
    acid: ["oic acid", "carboxylic acid"], anhydride: ["oic acid", "carboxylic acid"], halide: ["oyl", "carbonyl"],
    sulfonic: ["sulfonic acid", "sulfonic acid"], sulfonylhalide: ["sulfonyl", "sulfonyl"], urea: ["", ""], carbamate: ["", ""], ester: ["oate", "carboxylate"], amide: ["amide", "carboxamide"], nitrile: ["nitrile", "carbonitrile"],
    aldehyde: ["al", "carbaldehyde"], ketone: ["one", "one"], alcohol: ["ol", "ol"], thiol: ["thiol", "thiol"], amine: ["amine", "amine"],
    aminium: ["aminium", "aminium"], imine: ["imine", "imine"],
    carboxylate: ["oate", "carboxylate"], sulfonate: ["sulfonate", "sulfonate"], sulfinate: ["sulfinate", "sulfinate"], olate: ["olate", "olate"], aminide: ["aminide", "aminide"], ide: ["ide", "ide"],
    ylium: ["ylium", "ylium"], iminium: ["iminium", "iminium"], diazonium: ["diazonium", "diazonium"],
    peroxyacid: ["peroxoic acid", "carboperoxoic acid"], peroxoate: ["peroxoate", "carboperoxoate"],
  };
  let s = own ?? base[kind!][ring ? 1 : 0];
  // The chain's own carbon carries -oic acid, -al, -nitrile and -amide, always at an end, so no locants (P-31.1.4.2.1).
  const terminal = !ring && !!kind && CARBON_GROUP.has(kind);
  if (m > 1) s = MULT[m] + (s.startsWith("oic") ? "oic acid" : s);
  if (terminal && kind === "nitrile" && m === 1 && !one) s = "nitrile";
  const word = m > 1 && terminal && kind === "acid" ? `${MULT[m]}oic acid` : s;
  const elide = VOWEL.test(word) ? parent.replace(/e(\]?)$/, "$1") : parent;
  if (terminal || (locantFree && m === 1 && ring) || (one && m === 1)) return (VOWEL.test(word) ? elide : parent) + word;
  return `${VOWEL.test(word) ? elide : parent}-${locs.join(",")}-${word}`;
}

// Salts (P-65.6.2.2, P-73; IUPAC 2005 IR-5): cations, then anions, each with a multiplying prefix for the ratio:
// sodium acetate, calcium diacetate, disodium butanedioate, sodium chloride, dipotassium carbonate, ammonium chloride,
// N,N,N-trimethylmethanaminium chloride, pyridin-1-ium chloride.
// Several cations or anions go in alphabetical order (IR-5.4): potassium sodium tartrate. A metal with a Stock number
// needs no multiplying prefixes: iron(III) chloride. Hydrogen halides and water of crystallisation follow (IR-5.5):
// aniline hydrochloride, copper(II) sulfate pentahydrate.
function saltName(g: Graph, parts: number[][]): string | undefined {
  const lone = (p: number[], el: string, h: number) => p.length === 1 && g.atoms[p[0]].el === el && g.atoms[p[0]].h === h && !g.atoms[p[0]].charge;
  const adducts = ["Cl", "Br", "I", "F", "O"].map((el) => [el, parts.filter((p) => lone(p, el, el === "O" ? 2 : 1)).length] as const).filter(([, k]) => k);
  const rest = parts.filter((p) => !["Cl", "Br", "I", "F", "O"].some((el) => lone(p, el, el === "O" ? 2 : 1)));
  if (adducts.length && rest.length) {
    if (adducts.some(([, k]) => k >= MULT.length)) return undefined;
    const main = rest.length === 1 ? speciesName(partOf(g, rest[0])) ?? new Namer(partOf(g, rest[0])).name() : saltName(g, rest);
    return main && [main, ...adducts.map(([el, k]) => el === "O" ? `${k === 1 ? "mono" : MULT[k]}hydrate` : `${MULT[k]}hydro${HALIDE[el]}`)].join(" ");
  }
  const charge = (p: number[]) => p.reduce((t, i) => t + g.atoms[i].charge, 0);
  const cations = parts.filter((p) => charge(p) > 0), anions = parts.filter((p) => charge(p) < 0);
  if (!cations.length || !anions.length || cations.length + anions.length !== parts.length || parts.reduce((t, p) => t + charge(p), 0) !== 0) return undefined;
  // An anion: inorganic, then by the namer (methanolate, 3-carboxypropanoate), then from its acid.
  const anion = (p: number[]) => {
    const part = partOf(g, p), simple = inorganicName(part, ionFormula(g, p)) ?? speciesName(part);
    if (simple) return simple;
    try { return new Namer(part).name(); } catch (e) {
      let old: string | undefined;
      try { old = anionName(g, p); } catch { old = undefined; }
      if (old) return old;
      throw e;
    }
  };
  const cationNames = cations.map((p) => cationName(g, p)), anionNames = anions.map(anion);
  if (cationNames.includes(undefined) || anionNames.includes(undefined)) return undefined;
  // Repeated formula units (two NaCl) have no name that keeps their count.
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
  if (new Set(cationNames).size === 1 && new Set(anionNames).size === 1 && gcd(cations.length, anions.length) > 1) return undefined;
  // OPSIN reads a nitride only with Li, Na, K, Be, Mg, Ca or Sr, and an amide only with an s-block metal; an oxide or
  // sulfide only with a metal that has no Stock number; a hydride or cyanide not with a Stock-numbered metal, silver or
  // aluminium (it makes them covalent).
  const metals = cations.map((p) => (p.length === 1 ? g.atoms[p[0]].el : ""));
  const stockName = cationNames.some((n) => /\([IVX]+\)$/.test(n!));
  for (const n of anionNames) {
    if (n === "nitride" && !metals.every((e) => /^(Li|Na|K|Be|Mg|Ca|Sr)$/.test(e))) return undefined;
    if (n === "amide" && !metals.every((e) => /^(Li|Na|K|Rb|Cs|Fr|Be|Mg|Ca|Sr|Ba|Ra)$/.test(e))) return undefined;
    if (/^(oxide|sulfide|selenide|telluride)$/.test(n!) && (stockName || !metals.every((e) => CATIONS[e] || metal(e)))) return undefined;
    if ((n === "hydride" || n === "cyanide") && (stockName || metals.some((e) => e === "Ag" || e === "Al"))) return undefined;
  }
  // Multiplying prefixes (IR-5.4): di and tri before a simple ion (sodium, chloride, acetate); bis and tris before
  // everything else, where di could be read otherwise: oxoanions (diphosphate is another anion), hydrogen anions and
  // substituted names (dicarboxymethanaminium). None with a Stock number or a nitride, and none before an anion with a
  // space (magnesium methyl sulfate): OPSIN takes the ratio from the charges there.
  const bare = stockName || anionNames.includes("nitride"), spaced = anionNames.some((n) => n!.includes(" "));
  const oxo = new Set([...Object.values(ANIONS), ...Object.values(LINKED), ...Object.values(PEROXY)].filter((n) => /(ate|ite)$/.test(n) && n !== "thiocyanate"));
  const simple = new Set([...Object.values(ANIONS).filter((n) => !oxo.has(n)), ...Object.values(CATIONS).map((c) => c[0]), "ammonium", "acetate", "formate", "benzoate", "phenolate"]);
  const plain = (n: string) => simple.has(n) && !/^(di|tri|tetra|penta|hexa|hydrogen)/.test(n);
  const times = (k: number, name: string, anion: boolean) => (k < 2 || bare || (anion && spaced) ? name : plain(name) ? MULT[k] + name : `${MULT_COMPLEX[k]}(${name})`);
  const list = (names: string[], anion: boolean) => [...new Set(names)].sort((a, b) => alphaKey(a).localeCompare(alphaKey(b))).map((n) => times(names.filter((x) => x === n).length, n, anion)).join(" ");
  return `${list(cationNames as string[], false)} ${list(anionNames as string[], true)}`;
}
// One part of a salt as a structure of its own.
function partOf(g: Graph, part: number[]): Graph {
  const index = new Map(part.map((i, k) => [i, k]));
  return { atoms: part.map((i) => ({ ...g.atoms[i] })), bonds: g.bonds.filter((b) => index.has(b.a)).map((b) => ({ ...b, a: index.get(b.a)!, b: index.get(b.b)! })) };
}
// A cation: a metal ion with its usual charge, ammonium, or an organic cation (aminium, ring "-ium").
function cationName(g: Graph, part: number[]): string | undefined {
  const a = g.atoms[part[0]];
  if (part.length === 1 && CATIONS[a.el]) return CATIONS[a.el][1] === a.charge && !a.h ? CATIONS[a.el][0] : undefined;
  if (part.length === 1 && metal(a.el) && !a.h) return ROMAN[a.charge] ? `${ELEMENTS.get(a.el)}(${ROMAN[a.charge]})` : undefined;
  if (part.length === 1 && a.el === "N" && a.h === 4 && a.charge === 1) return "ammonium";
  return speciesName(partOf(g, part)) ?? new Namer(partOf(g, part)).name();
}
// The formula of a part, with hydrogens, and its charge: CO3-2, HO-1. Carbon first, then hydrogen, then the others
// in alphabetical order; without carbon, all in alphabetical order.
function ionFormula(g: Graph, part: number[]): string {
  const count = new Map<string, number>();
  for (const i of part) { const a = g.atoms[i]; count.set(a.el, (count.get(a.el) ?? 0) + 1); if (a.h) count.set("H", (count.get("H") ?? 0) + a.h); }
  const els = [...count.keys()].sort((x, y) => (count.has("C") ? (x === "C" ? -1 : y === "C" ? 1 : x === "H" ? -1 : y === "H" ? 1 : 0) : 0) || (x < y ? -1 : x > y ? 1 : 0));
  return els.map((e) => e + (count.get(e)! > 1 ? count.get(e) : "")).join("") + part.reduce((t, i) => t + g.atoms[i].charge, 0);
}
// An anion: an inorganic one (chloride, carbonate), or one named from its acid or alcohol: every acid group (or
// every O- on carbon) must be ionised and on the parent (P-65.6.2.2): acetate, butanedioate, methanolate, phenolate.
function anionName(g: Graph, part: number[]): string | undefined {
  const inorganic = inorganicName(partOf(g, part), ionFormula(g, part));
  if (inorganic) return inorganic;
  const { atoms, bonds } = partOf(g, part);
  const nbrs = (k: number) => bonds.flatMap((b) => (b.a === k ? [b] : b.b === k ? [{ ...b, b: b.a }] : []));
  // An acid group's OH: O on a C=O carbon, or on an S with two =O.
  const acidO = (k: number) => {
    const n = nbrs(k);
    if (atoms[k].el !== "O" || n.length !== 1 || n[0].order !== 1) return false;
    const owner = n[0].b, doubles = nbrs(owner).filter((b) => b.order === 2 && atoms[b.b].el === "O").length;
    return (atoms[owner].el === "C" && doubles === 1) || (atoms[owner].el === "S" && doubles === 2);
  };
  let ions = 0, olates = 0;
  for (let k = 0; k < atoms.length; k++) {
    const n = nbrs(k);
    if (acidO(k)) {
      if (atoms[k].charge !== -1) return undefined; // a hydrogen salt
      ions++;
    } else if (atoms[k].el === "O" && atoms[k].charge === -1 && n.length === 1 && n[0].order === 1 && atoms[n[0].b].el === "C") olates++;
    else continue;
    atoms[k] = { ...atoms[k], charge: 0, h: 1 };
  }
  if (ions && olates) return undefined;
  const name = new Namer({ atoms, bonds }).name();
  if (olates) {
    const m = name?.match(/(di|tri|tetra)?ol$/);
    return m && (m[1] ? MULT.indexOf(m[1]) : 1) === olates ? `${name}ate` : undefined;
  }
  const mult = name?.match(/(di|tri|tetra)(oic|carboxylic|sulfonic) acid$/)?.[1];
  if (!name?.endsWith("ic acid") || (mult ? MULT.indexOf(mult) : 1) !== ions) return undefined;
  return name.replace(/ic acid$/, "ate");
}

// ——— Simple species: lone atoms, parent hydrides, inorganic molecules and ions (IUPAC 2005 IR-3, IR-5, IR-6) ———
const ELEMENTS = new Map(("H hydrogen He helium Li lithium Be beryllium B boron C carbon N nitrogen O oxygen F fluorine Ne neon Na sodium " +
  "Mg magnesium Al aluminium Si silicon P phosphorus S sulfur Cl chlorine Ar argon K potassium Ca calcium Sc scandium Ti titanium " +
  "V vanadium Cr chromium Mn manganese Fe iron Co cobalt Ni nickel Cu copper Zn zinc Ga gallium Ge germanium As arsenic Se selenium " +
  "Br bromine Kr krypton Rb rubidium Sr strontium Y yttrium Zr zirconium Nb niobium Mo molybdenum Tc technetium Ru ruthenium " +
  "Rh rhodium Pd palladium Ag silver Cd cadmium In indium Sn tin Sb antimony Te tellurium I iodine Xe xenon Cs caesium Ba barium " +
  "La lanthanum Ce cerium Pr praseodymium Nd neodymium Pm promethium Sm samarium Eu europium Gd gadolinium Tb terbium " +
  "Dy dysprosium Ho holmium Er erbium Tm thulium Yb ytterbium Lu lutetium Hf hafnium Ta tantalum W tungsten Re rhenium Os osmium " +
  "Ir iridium Pt platinum Au gold Hg mercury Tl thallium Pb lead Bi bismuth Po polonium At astatine Rn radon Fr francium Ra radium " +
  "Ac actinium Th thorium Pa protactinium U uranium Np neptunium Pu plutonium Am americium Cm curium Bk berkelium Cf californium " +
  "Es einsteinium Fm fermium Md mendelevium No nobelium Lr lawrencium Rf rutherfordium Db dubnium Sg seaborgium Bh bohrium " +
  "Hs hassium Mt meitnerium Ds darmstadtium Rg roentgenium Cn copernicium Nh nihonium Fl flerovium Mc moscovium Lv livermorium " +
  "Ts tennessine Og oganesson").split(" ").flatMap((w, k, a) => (k % 2 ? [] : [[w, a[k + 1]] as [string, string]])));
// Mononuclear parent hydrides (P-21.1, IR-6.2) by element and hydrogen count; water, ammonia and the hydrogen halides
// by the names chemists use.
const HYDRIDES: Record<string, string> = {
  B3: "borane", Al3: "alumane", Ga3: "gallane", In3: "indigane", Tl3: "thallane", Si4: "silane", Ge4: "germane", Sn4: "stannane",
  Pb4: "plumbane", N3: "ammonia", P3: "phosphane", As3: "arsane", Sb3: "stibane", Bi3: "bismuthane", O2: "water", S2: "hydrogen sulfide",
  Se2: "hydrogen selenide", Te2: "hydrogen telluride", Po2: "polane", F1: "hydrogen fluoride", Cl1: "hydrogen chloride",
  Br1: "hydrogen bromide", I1: "hydrogen iodide", At1: "astatane", P5: "λ5-phosphane",
};
// Inorganic molecules and ions of one central atom and the atoms bonded to it (IR-5, IR-8), by that shape: the centre,
// then each bond and atom (atoms with their hydrogens and charge). Every name is read back by OPSIN.
const SPECIES = new Map(([
  ["dihydrogen", "H", "-H"], ["dinitrogen", "N", "#N"], ["dioxygen", "O", "=O"], ["difluorine", "F", "-F"], ["dichlorine", "Cl", "-Cl"],
  ["dibromine", "Br", "-Br"], ["diiodine", "I", "-I"], ["ozone", "O+", "=O", "-O-"], ["hydrogen peroxide", "OH", "-OH"],
  ["nitrous oxide", "N+", "#N", "-O-"], ["nitrous oxide", "N+", "=N-", "=O"], ["hydrogen azide", "N+", "=N-", "=NH"], ["hydrazine", "NH2", "-NH2"],
  ["hydroxylamine", "NH2", "-OH"], ["carbon dioxide", "C", "=O", "=O"], ["carbon disulfide", "C", "=S", "=S"], ["sulfur dioxide", "S", "=O", "=O"],
  ["sulfur trioxide", "S", "=O", "=O", "=O"], ["sulfuric acid", "S", "=O", "=O", "-OH", "-OH"], ["sulfurous acid", "S", "=O", "-OH", "-OH"],
  ["nitric acid", "N+", "=O", "-O-", "-OH"], ["nitric acid", "N", "=O", "=O", "-OH"], ["nitrous acid", "N", "=O", "-OH"],
  ["phosphoric acid", "P", "=O", "-OH", "-OH", "-OH"], ["perchloric acid", "Cl", "=O", "=O", "=O", "-OH"], ["carbonic acid", "C", "=O", "-OH", "-OH"],
  ["nitronium", "N+", "=O", "=O"], ["nitrosonium", "N", "#O+"], ["ammonium", "NH4+"], ["oxidanium", "OH3+"], ["phosphanium", "PH4+"],
  ["sulfanium", "SH3+"], ["aminylium", "NH2+"], ["hydroxylium", "OH+"], ["azanide", "NH2-"], ["hydride", "H-"], ["bifluoride", "H-", "-F", "-F"],
  ["hypofluorous acid", "F", "-OH"], ["periodic acid", "I", "=O", "=O", "=O", "-OH"], ["orthoperiodic acid", "I", "=O", "-OH", "-OH", "-OH", "-OH", "-OH"],
  ...["chlor", "brom", "iod"].flatMap((x) => {
    const X = x === "chlor" ? "Cl" : x === "brom" ? "Br" : "I";
    return [[`hypo${x}ous acid`, X, "-OH"], [`${x}ous acid`, X, "=O", "-OH"], [`${x}ic acid`, X, "=O", "=O", "-OH"], [`per${x}ic acid`, X, "=O", "=O", "=O", "-OH"]];
  }),
  ["phosphonic acid", "PH", "=O", "-OH", "-OH"], ["phosphinic acid", "PH2", "=O", "-OH"], ["sulfamic acid", "S", "=O", "=O", "-NH2", "-OH"],
  ["phosphorus trichloride", "P", "-Cl", "-Cl", "-Cl"], ["phosphorus tribromide", "P", "-Br", "-Br", "-Br"],
  ["phosphorus pentachloride", "P", "-Cl", "-Cl", "-Cl", "-Cl", "-Cl"], ["phosphoryl trichloride", "P", "=O", "-Cl", "-Cl", "-Cl"],
  ["thionyl dichloride", "S", "=O", "-Cl", "-Cl"], ["thionyl dibromide", "S", "=O", "-Br", "-Br"], ["sulfuryl dichloride", "S", "=O", "=O", "-Cl", "-Cl"],
  ["sulfur hexafluoride", "S", "-F", "-F", "-F", "-F", "-F", "-F"], ["nitrosyl chloride", "N", "=O", "-Cl"], ["carbonyl dichloride", "C", "=O", "-Cl", "-Cl"],
  ["carbonothioyl dichloride", "C", "=S", "-Cl", "-Cl"], ["carbonyl sulfide", "C", "=O", "=S"], ["carbon monoxide", "C-", "#O+"],
  ["hydrogen cyanide", "CH", "#N"], ["cyanogen chloride", "C", "#N", "-Cl"], ["cyanogen bromide", "C", "#N", "-Br"], ["cyanamide", "C", "#N", "-NH2"],
  ["carbamate", "C", "=O", "-NH2", "-O-"],
  // Lone anions that OPSIN reads only by their substitutive names (in a salt they are oxide, sulfide, nitride).
  ["oxidanediide", "O--"], ["sulfanediide", "S--"], ["selanediide", "Se--"], ["tellanediide", "Te--"], ["azanetriide", "N---"],
  ["dioxidanediide", "O-", "-O-"],
] as string[][]).map(([name, centre, ...bonds]) => [`${centre}(${bonds.sort().join(",")})`, name]));
Object.assign(ANIONS, {
  "H2N-1": "amide", "N-3": "nitride", "O2-2": "dioxidanediide", "HO2-1": "hydroperoxide", "HS-1": "sulfanide", "Se-2": "selenide",
  "Te-2": "telluride", "ClO3-1": "chlorate", "ClO2-1": "chlorite", "BrO-1": "hypobromite", "BrO2-1": "bromite", "BrO3-1": "bromate",
  "BrO4-1": "perbromate", "IO-1": "hypoiodite", "IO2-1": "iodite", "IO3-1": "iodate", "O3P-3": "phosphite", "H2O2P-1": "phosphinate",
  "O7P2-4": "diphosphate", "O10P3-5": "triphosphate", "O7S2-2": "disulfate", "O8S2-2": "peroxydisulfate", "O4Se-2": "selenate", "O3Se-2": "selenite",
  "CrO4-2": "chromate", "Cr2O7-2": "dichromate", "AsF6-1": "hexafluoroarsenate", "F6Sb-1": "hexafluoroantimonate", "AlCl4-1": "tetrachloroaluminate",
  "AlH4-1": "tetrahydroaluminate", "I3-1": "triiodide", "Br3-1": "tribromide", "H2NO3S-1": "sulfamate", "IO6-5": "orthoperiodate",
  "O5S2-2": "disulfite", "O5P2-4": "diphosphite", "O13P4-6": "tetraphosphate", "O16P5-7": "pentaphosphate", "ClCrO3-1": "chlorochromate",
  "FO-1": "hypofluorite",
});
// Anions of two or more centres joined by O (O3S-O-SO3), or by O-O in peroxydisulfate. The rest have one centre.
const BRIDGED = new Set(["O7P2-4", "O10P3-5", "O13P4-6", "O16P5-7", "O7S2-2", "O8S2-2", "Cr2O7-2", "O5S2-2", "O5P2-4"]);
// Anions of one centre with an O-O-, or O-OH, on it: peroxymonosulfate (Oxone's anion).
const PEROXY: Record<string, string> = { "O5S-2": "peroxymonosulfate", "HO5S-1": "hydrogen peroxymonosulfate" };
// Anions of two centres bonded to each other (O2S-SO2), whose formulas may also be an O-bridged anion's.
const LINKED: Record<string, string> = { "O4S2-2": "dithionite", "O5S2-2": "metabisulfite", "O6S2-2": "dithionate", "O6P2-4": "hypodiphosphate", "O4P2-4": "hypodiphosphite" };
// Metals with one usual charge in salts, besides CATIONS (P-65.6.2.2): named without a Stock number.
Object.assign(CATIONS, { Be: ["beryllium", 2], Al: ["aluminium", 3], Fr: ["francium", 1], Ra: ["radium", 2], Cd: ["cadmium", 2], Sc: ["scandium", 3], Y: ["yttrium", 3], La: ["lanthanum", 3] });
const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII"];
// Metals that are not in CATIONS: named with their charge as a Stock number in salts, iron(III) chloride.
const metal = (el: string) => ELEMENTS.has(el) && !/^(H|He|B|C|N|O|F|Ne|Si|P|S|Cl|Ar|As|Se|Br|Kr|Te|I|Xe|At|Rn)$/.test(el);
// The shapes of a structure for SPECIES: each atom bonded to all the others as the centre.
function shapes(g: Graph): string[] {
  const label = (i: number) => { const a = g.atoms[i]; return `${a.el}${a.h ? `H${a.h > 1 ? a.h : ""}` : ""}${(a.charge > 0 ? "+" : "-").repeat(Math.abs(a.charge))}`; };
  if (g.bonds.length !== g.atoms.length - 1) return [];
  return g.atoms.flatMap((_, c) => {
    const bonds = g.bonds.filter((b) => b.a === c || b.b === c);
    return bonds.length === g.atoms.length - 1 ? [`${label(c)}(${bonds.map((b) => "-=#"[b.order - 1] + label(b.a === c ? b.b : b.a)).sort().join(",")})`] : [];
  });
}
// An inorganic anion by its formula, if it has the expected shape: one centre (not O, unless all atoms are O); for
// BRIDGED, centres joined only through O; for LINKED, two centres bonded to each other and the O on them.
function inorganicName(g: Graph, formula: string): string | undefined {
  if (g.atoms.length === 1) return ANIONS[formula];
  const el = (i: number) => g.atoms[i].el, o = (k: number) => g.bonds.filter((b) => (el(b.a) === "O" ? 1 : 0) + (el(b.b) === "O" ? 1 : 0) === k).length;
  if (g.bonds.length !== g.atoms.length - 1) return undefined;
  if (LINKED[formula] && o(0) === 1 && o(2) === 0) return LINKED[formula];
  if (PEROXY[formula]) {
    const oo = g.bonds.find((b) => el(b.a) === "O" && el(b.b) === "O"), end = oo && [oo.a, oo.b].find((i) => g.bonds.filter((b) => b.a === i || b.b === i).length === 1);
    return !o(0) && o(2) === 1 && end !== undefined && (g.atoms[end].h === 1 || g.atoms[end].charge === -1) ? PEROXY[formula] : undefined;
  }
  if (BRIDGED.has(formula)) return !o(0) && o(2) === (formula === "O8S2-2" ? 1 : 0) ? ANIONS[formula] : undefined;
  return ANIONS[formula] && shapes(g).some((s) => s[0] !== "O" || g.atoms.every((a) => a.el === "O")) ? ANIONS[formula] : undefined;
}

// Hydrogen drawn as atoms: an H with one single bond to another atom becomes part of that atom's hydrogen count.
// H2, hydride and bridging hydrogens stay as atoms.
function foldHydrogens(g: Graph): Graph {
  const bonds = g.atoms.map(() => [] as Graph["bonds"]);
  for (const b of g.bonds) { bonds[b.a].push(b); bonds[b.b].push(b); }
  const fold = g.atoms.map((a, i) => a.el === "H" && !a.charge && !a.h && bonds[i].length === 1 && bonds[i][0].order === 1 && g.atoms[bonds[i][0].a === i ? bonds[i][0].b : bonds[i][0].a].el !== "H");
  if (!fold.includes(true)) return g;
  const atoms = g.atoms.map((a) => ({ ...a })), index: number[] = [];
  for (const b of g.bonds) { if (fold[b.a]) atoms[b.b].h++; if (fold[b.b]) atoms[b.a].h++; }
  let k = 0;
  for (let i = 0; i < atoms.length; i++) index.push(fold[i] ? -1 : k++);
  return { atoms: atoms.filter((_, i) => !fold[i]), bonds: g.bonds.filter((b) => !fold[b.a] && !fold[b.b]).map((b) => ({ ...b, a: index[b.a], b: index[b.b] })) };
}
// A structure of one fragment that is a simple species: a lone atom by its element name (argon, sodium), a parent
// hydride (ammonia, phosphane), a monatomic ion (chloride, sodium(1+)), or an inorganic molecule or ion by formula
// (hydrogen peroxide, nitrate). Undefined for the rest, which the namer names.
function speciesName(g: Graph): string | undefined {
  const known = shapes(g).find((s) => SPECIES.has(s));
  if (known) return SPECIES.get(known);
  const f = ionFormula(g, g.atoms.map((_, i) => i));
  const inorganic = f.includes("-") ? inorganicName(g, f) : undefined;
  if (inorganic) return inorganic;
  if (g.atoms.length !== 1) return undefined;
  const a = g.atoms[0];
  if (!a.charge) return a.h ? HYDRIDES[`${a.el}${a.h}`] : a.el === "H" ? undefined : ELEMENTS.get(a.el);
  return a.charge > 0 && !a.h && a.el !== "H" && ELEMENTS.has(a.el) ? `${ELEMENTS.get(a.el)}(${a.charge}+)` : undefined;
}

// An N-oxide (P-62.5): the amine or ring with one N, named without its O-, then "N-oxide": pyridine N-oxide,
// N,N-dimethylmethanamine N-oxide, 4-methylmorpholine N-oxide. Undefined for anything else.
function nOxideName(g: Graph): string | undefined {
  const charged = g.atoms.flatMap((a, i) => (a.charge ? [i] : []));
  if (charged.length !== 2 || g.atoms.filter((a) => a.el === "N").length !== 1) return undefined;
  const o = charged.find((i) => g.atoms[i].el === "O" && g.atoms[i].charge === -1 && !g.atoms[i].h), n = charged.find((i) => g.atoms[i].el === "N" && g.atoms[i].charge === 1);
  const bond = g.bonds.find((b) => (b.a === o && b.b === n) || (b.a === n && b.b === o));
  if (o === undefined || n === undefined || !bond || bond.order !== 1 || g.bonds.filter((b) => b.a === o || b.b === o).length !== 1) return undefined;
  const keep = g.atoms.map((_, i) => i).filter((i) => i !== o), index = new Map(keep.map((i, k) => [i, k]));
  const amine: Graph = { atoms: keep.map((i) => ({ ...g.atoms[i], charge: 0 })), bonds: g.bonds.filter((b) => b !== bond).map((b) => ({ ...b, a: index.get(b.a)!, b: index.get(b.b)! })) };
  try { const name = new Namer(amine).name(); return name && `${name} N-oxide`; } catch { return undefined; }
}

export function iupacName(g: Graph): string | undefined {
  return iupacNameWhy(g).name;
}

// The name, or why Octet cannot name the structure yet (the namer's reason, for its tests and the gap survey).
export function iupacNameWhy(g: Graph): { name?: string; why?: string } {
  try {
    if (!g.atoms.length) return { why: "empty" };
    g = foldHydrogens(g);
    // Fragments: one structure, or a salt.
    const adj = g.atoms.map(() => [] as number[]);
    for (const b of g.bonds) { adj[b.a].push(b.b); adj[b.b].push(b.a); }
    const parts: number[][] = [], seen = new Set<number>();
    for (let s = 0; s < g.atoms.length; s++) {
      if (seen.has(s)) continue;
      const part = [s], stack = [s];
      seen.add(s);
      while (stack.length) { const i = stack.pop()!; for (const j of adj[i]) if (!seen.has(j)) { seen.add(j); part.push(j); stack.push(j); } }
      parts.push(part);
    }
    const name = parts.length === 1 ? speciesName(g) ?? nOxideName(g) ?? new Namer(g).name() : saltName(g, parts);
    return name ? { name } : { why: parts.length === 1 ? "no name" : "salt" };
  } catch (e) {
    return { why: e instanceof Error ? e.message : String(e) };
  }
}
