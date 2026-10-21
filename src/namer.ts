// Octet's IUPAC namer: substitutive names from a molecular graph, following the IUPAC 2013 recommendations
// (Nomenclature of Organic Chemistry, P-1 to P-6). Clean room: written from the published rules. It names what it
// understands and returns undefined for the rest; the app also checks every name by reading it back with OPSIN.
//
// Covered: acyclic chains; monocyclic rings (carbocycles, benzene, common heterocycles by their retained names);
// fused ring systems with retained names (naphthalene, indole, quinoline and others) with indicated hydrogen, added
// hydrogen and hydro prefixes; ring assemblies of two identical rings (1,1'-biphenyl); principal characteristic groups
// (carboxylic and sulfonic acids, esters, acid halides, amides, nitriles, aldehydes, ketones, alcohols, thiols,
// amines, imines and oximes) as suffixes; everything else as prefixes, nested to any depth; anhydrides, ureas,
// carbamates (also as prefixes: Boc-glycine); phosphanes and their oxides; aminium and ring "-ium" cations; salts of
// metal and ammonium cations with acid, alkoxide and inorganic anions; bicyclic von Baeyer and monospiro rings with
// oxa, thia and aza replacement; R/S and E/Z. Not yet: polycyclic bridged rings (adamantane), fused systems outside
// the table, larger ring assemblies, and other charged atoms. Octet's own name tables cover some of these (naming.ts).
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
// Carbonic acid derivatives rank as the acids, esters, halides and amides they are, each after the carboxylic one:
// carbonic (carbamic acid), carbamate (carbamates, carbonates), carbonylhalide (carbamoyl chloride), urea.
// Cations (aminium) are senior to every neutral group (P-41).
// Imidic acids, their esters and halides, and amidines and guanidines (amides of imidic acids, P-65.1.3.1,
// P-66.4.1), each after its oxo analogue; peroxy acids, their esters and diacyl peroxides likewise (P-65.1.4).
type Kind = "aminium" | "acid" | "peroxy" | "imidic" | "carbonic" | "sulfonic" | "anhydride" | "peroxide" | "ester" | "peroxyester" | "imidate" | "carbamate" | "halide" | "imidoylhalide" | "carbonylhalide" | "sulfonylhalide" | "amide" | "amidine" | "urea" | "guanidine" | "hydrazide" | "nitrile" | "aldehyde" | "ketone" | "alcohol" | "thiol" | "amine" | "imine";
const SENIORITY: Kind[] = ["aminium", "acid", "peroxy", "imidic", "carbonic", "sulfonic", "anhydride", "peroxide", "ester", "peroxyester", "imidate", "carbamate", "halide", "imidoylhalide", "carbonylhalide", "sulfonylhalide", "amide", "amidine", "urea", "guanidine", "hydrazide", "nitrile", "aldehyde", "ketone", "alcohol", "thiol", "amine", "imine"];
// Groups whose carbon is counted in a chain name (propanoic acid) but cited as "carbo…" on a ring (cyclohexanecarboxylic acid).
const CARBON_GROUP = new Set<Kind>(["acid", "peroxy", "imidic", "anhydride", "ester", "peroxyester", "imidate", "halide", "imidoylhalide", "amide", "amidine", "hydrazide", "nitrile", "aldehyde"]);
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
// A parent: a chain or ring (or ring assembly), a hydrazine or diazene (hetero), or a chain whose carboxylic groups hang
// on it as "carbo…" suffixes (attached: propane-1,2,3-tricarboxylic acid).
type Parent = { atoms: number[]; ring: boolean; assembly?: Assembly; hetero?: string; attached?: boolean };
const HYDRO = [...MULT, "undeca", "dodeca", "trideca", "tetradeca"];

// Retained names used in preferred IUPAC names (P-65, P-66, P-63): parent ring or chain, principal group, name.
const RETAINED: Record<string, string> = {
  "benzene:acid": "benzoic acid", "benzene:ester": "benzoate", "benzene:amide": "benzamide", "benzene:nitrile": "benzonitrile",
  "benzene:aldehyde": "benzaldehyde", "benzene:alcohol": "phenol", "benzene:amine": "aniline",
  "C2:acid": "acetic acid", "C2:ester": "acetate", "C2:amide": "acetamide", "C2:nitrile": "acetonitrile", "C2:aldehyde": "acetaldehyde",
  "C1:acid": "formic acid", "C1:ester": "formate", "C1:amide": "formamide", "C1:aldehyde": "formaldehyde",
  "benzene:anhydride": "benzoic acid", "C2:anhydride": "acetic acid", "C1:anhydride": "formic acid",
  "benzene:halide": "benzoyl", "C2:halide": "acetyl", "C1:halide": "formyl",
  "benzene:hydrazide": "benzohydrazide", "C2:hydrazide": "acetohydrazide", "C1:hydrazide": "formohydrazide",
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
  pseudo = new Set<number>(); // the atoms of groups cited only as prefixes (isocyanato, cyanato), which are not carbon parents
  prefixOnly = new Map<number, string>(); // such a group's attachment atom → its prefix
  whole?: string; // the name of a molecule that is one such group with H: isocyanic acid, cyanic acid
  diimine = new Set<number>(); // carbodiimide carbons, R-N=C=N-R
  nO = new Set<number>(); // the O of N-hydroxy and N-alkoxy amides, ureas and carbamates
  hzN = new Set<number>(); // the N atoms of a hydrazine or diazene that is the parent of a carbonyl group on its N
  peroxO = new Set<number>(); // the O-O of peroxy acids, their esters and diacyl peroxides

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
    for (let i = 0; i < this.n; i++) {
      if (!["C", "N", "O", "S", "P", "F", "Cl", "Br", "I"].includes(el[i])) throw new Error(`element ${el[i]}`);
      if (q[i] && !this.nitroAtom(i) && !this.cationN(i) && !this.diazoAtom(i) && !this.azidoAtom(i)) throw new Error("charge");
    }
    for (let c = 0; c < this.n; c++) if (el[c] === "C") this.pseudoGroup(c);
    for (let c = 0; c < this.n; c++) {
      if (el[c] !== "C" || this.pseudo.has(c)) continue;
      // A ring N joined to a functional carbon outside its ring stands where a ring carbon would (P-66.1.1.4.3, P-64.1.2):
      // piperidine-1-carboxylic acid, tert-butyl azetidine-1-carboxylate, 1-(piperidin-1-yl)ethan-1-one.
      const o = this.carbonylO[c], cs = [...this.carbons(c), ...this.ringN(c)];
      const others = adj[c].filter((j) => j !== o && !cs.includes(j));
      const nitrileN = adj[c].find((j) => el[j] === "N" && this.ord(c, j) === 3 && adj[j].length === 1);
      if (nitrileN !== undefined) {
        // Cyanamide, cyanic acid and carbononitridic halides (P-66.5.1.1): N#C on N, OH or halogen, with no carbon.
        const y = others.find((j) => j !== nitrileN)!;
        if (!cs.length && others.length === 2 && !this.inRing[c] && this.ord(c, y) === 1 && !this.q[y] && ((HALO[el[y]] && adj[y].length === 1) || (el[y] === "O" && this.h[y] === 1 && adj[y].length === 1)
          || (el[y] === "N" && !this.inRing[y] && adj[y].every((j) => j === c || (el[j] === "C" && !this.isNitrileC(j)))))) {
          this.mark(c, "nitrile", []);
          this.group[nitrileN] = "nitrile";
          this.group[y] ??= "nitrile"; // unless the N is a guanidine's (N-cyanoguanidine, cimetidine)
          continue;
        }
        if (this.inRing[c] || cs.length > 1 || others.length !== 1) throw new Error("nitrile");
        this.mark(c, "nitrile", cs);
        this.group[nitrileN] = "nitrile";
        continue;
      }
      // Imines and oximes (P-62.3.1.1, P-68.3.1.1.1): C=N, the N bearing H, a carbon or an O (N-hydroxy, N-alkoxy).
      const n = this.imineN(c);
      if (n !== undefined) {
        const rest = others.filter((j) => j !== n);
        if (rest.length && o < 0 && !this.inRing[c]) { this.amidineGroup(c, n, cs, rest); continue; }
        if (o >= 0 || rest.length || this.fused[this.ringOf[c]]) throw new Error("imine");
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
        // An OH or O-alkyl on the ring N of a lactam or imide: 1-hydroxypyrrolidine-2,5-dione (N-hydroxysuccinimide).
        for (const n of adj[c]) if (el[n] === "N" && !q[n]) for (const j of adj[n]) if (!this.inRing[j] && this.nOxy(n, j)) this.nO.add(j);
        continue;
      }
      if (others.length === 0) {
        if (cs.length === 2) this.mark(c, "ketone", cs);
        else if (!this.inRing[c] && h[c] >= 1) this.mark(c, "aldehyde", cs);
        else if (cs.length === 1 && this.ord(c, cs[0]) === 2) this.mark(c, "ketone", cs); // a ketene: ethenone (P-64.1.1)
        else throw new Error("carbonyl");
        continue;
      }
      const hz = others.length === 2 && !cs.length ? this.hydrazineN(c) : [];
      if (hz.length === 1) { this.hydrazineGroup(c, hz[0], others.find((j) => j !== hz[0])!); continue; }
      if (hz.length === 2) {
        // Carbonic dihydrazide (P-66.3.1.1.3), H2N-NH-CO-NH-NH2, and nothing else on it.
        if (this.n !== 6 || hz.some((n) => adj[n].length !== 2 || adj[adj[n].find((j) => el[j] === "N")!].length !== 1 || adj[n].some((j) => this.ord(n, j) !== 1))) throw new Error("carbonic acid derivative");
        this.whole = "carbonic dihydrazide";
        for (const a of [c, o, ...hz, ...hz.map((n) => adj[n].find((j) => el[j] === "N")!)]) this.pseudo.add(a);
        continue;
      }
      if (others.length === 2 && !cs.length) { this.carbonicGroup(c, others); continue; }
      if (this.inRing[c] || others.length !== 1 || cs.length > 1) throw new Error("carbonyl");
      const x = others[0];
      // Acid halides, and acid pseudohalides (P-65.5.3): benzoyl isothiocyanate.
      if ((HALO[el[x]] && adj[x].length === 1) || this.prefixOnly.has(x)) { this.mark(c, "halide", cs); this.group[x] = "halide"; continue; }
      const y = el[x] === "O" && adj[x].length === 2 ? adj[x].find((j) => j !== c)! : -1;
      if (y >= 0 && el[y] === "C" && this.carbonylO[y] >= 0 && !this.inRing[y]) { this.mark(c, "anhydride", cs); this.group[x] = "anhydride"; this.anhydrideO.set(c, x); continue; }
      // A nitro group on a carbonyl carbon is a prefix on a ketone: 1-nitropropan-1-one.
      if (this.nitroAtom(x) && cs.length === 1) { this.mark(c, "ketone", cs); continue; }
      const peroxo = el[x] === "O" && adj[x].length === 2 ? adj[x].find((j) => j !== c && el[j] === "O" && !q[j] && !this.inRing[j]) : undefined;
      if (peroxo !== undefined) { this.peroxyGroup(c, cs, x, peroxo); continue; }
      if (el[x] === "O" && h[x] === 1 && adj[x].length === 1) { this.mark(c, "acid", cs); this.group[x] = "acid"; }
      else if (el[x] === "O" && adj[x].length === 2 && ((this.carbonylO[adj[x].find((j) => j !== c)!] < 0 && el[adj[x].find((j) => j !== c)!] === "C") || this.ringNO(x))) {
        this.mark(c, "ester", cs);
        this.esterO.set(c, x);
        this.group[x] = "ester";
      } else if (el[x] === "N" && this.ord(c, x) === 1 && !this.inRing[x] && adj[x].every((j) => j === c || (el[j] === "C" && !this.isNitrileC(j)) || this.nOxy(x, j))) {
        // N-acyl amides are imides (P-66.2.1.1): N-acetylacetamide. N-hydroxy amides are hydroxamic acids: N-hydroxyacetamide.
        this.mark(c, "amide", cs);
        this.group[x] = "amide";
        for (const j of adj[x]) if (this.nOxy(x, j)) this.nO.add(j);
      } else if (this.hydrazideN(c, x) !== undefined) {
        // Hydrazides (P-66.3.1): acetohydrazide, N'-phenylbenzohydrazide, pyridine-4-carbohydrazide.
        this.mark(c, "hydrazide", cs);
        this.group[x] = this.group[this.hydrazideN(c, x)!] = "hydrazide";
      } else throw new Error("carbonyl group");
    }
    // Sulfonic acids, sulfonyl halides (P-65.3), and the S of sulfoxides and sulfones (P-63.6), which are prefixes.
    for (let i = 0; i < this.n; i++) {
      if (el[i] !== "S" || this.inRing[i]) continue;
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
      if (el[i] !== "P") continue;
      const os = adj[i].filter((j) => el[j] === "O" && this.ord(i, j) === 2 && adj[j].length === 1 && !q[j]), rest = adj[i].filter((j) => !os.includes(j));
      if (this.inRing[i] || q[i] || os.length > 1 || rest.length + h[i] !== 3 || rest.some((j) => el[j] !== "C" || this.ord(i, j) !== 1 || this.carbonylO[j] >= 0) || this.cip[i]) throw new Error("phosphorus");
      this.phosphorus.add(i);
      for (const j of os) this.phosphorus.add(j);
    }
    for (let i = 0; i < this.n; i++) {
      if (this.group[i] || this.sulfur.has(i) || this.phosphorus.has(i) || this.pseudo.has(i) || el[i] === "C" || this.inRing[i]) continue;
      const cs = this.carbons(i);
      if (HALO[el[i]]) { if (adj[i].length !== 1 || cs.length !== 1) throw new Error("halogen"); continue; }
      if (el[i] === "O" && adj[i].some((j) => this.group[j] === "imine") && adj[i].length - cs.length === 1 && adj[i].length <= 2) continue; // an oxime's O: N-hydroxy, N-alkoxy
      if (this.nO.has(i) || this.hzN.has(i) || this.peroxO.has(i)) continue;
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
      if ((this.inRing[a] && this.ringOf[a] === this.ringOf[b]) || (this.sulfur.has(a) && this.sulfur.has(b))) continue;
      const oxime = (x: number, y: number) => this.group[x] === "imine" && el[x] === "N" && el[y] === "O" && o === 1;
      const oxide = this.phosphorus.has(a) && this.phosphorus.has(b);
      const n2 = (this.diazoAtom(a) && this.diazoAtom(b)) || (this.azidoAtom(a) && this.azidoAtom(b));
      if (el[a] !== "C" && el[b] !== "C" && !this.nitroBond(a, b) && !oxime(a, b) && !oxime(b, a) && !oxide && !n2 && !this.classBond(a, b)) throw new Error(`hetero bond ${el[a]}${o}${el[b]}`);
    }
  }
  mark(i: number, kind: Kind, on: number[]) { this.group[i] = kind; this.bearer.set(i, on); }
  // Carbonic acid and its derivatives (P-65.2.1, P-66.1.6): a C=O carbon with no carbon, and two of OH, O-alkyl, N
  // (not in a ring) and halogen. Carbonic and carbamic acids; carbamates, carbonates and carbonochloridates; carbonyl
  // dihalides and carbamoyl halides; ureas.
  carbonicGroup(c: number, ls: number[]) {
    const { el, adj } = this;
    const type = ls.map((x) => {
      if (HALO[el[x]] && adj[x].length === 1) return "X";
      if (el[x] === "O" && adj[x].length === 1 && this.h[x] === 1) return "OH";
      const r = adj[x].find((j) => j !== c);
      if (el[x] === "O" && adj[x].length === 2 && (el[r!] === "C" || this.ringNO(x))) return el[r!] !== "C" || this.carbonylO[r!] < 0 ? "OR" : this.inRing[r!] ? "" : "OCO";
      if (el[x] === "N" && this.ord(c, x) === 1 && !this.q[x] && adj[x].every((j) => j === c || (el[j] === "C" && !this.isNitrileC(j)) || this.nOxy(x, j))) return "N";
      return "";
    });
    if (type.includes("") || ls.some((x) => this.prefixOnly.has(x))) throw new Error("carbonic acid derivative");
    const kind: Kind = type.includes("OH") ? "carbonic" : type.includes("OR") || type.includes("OCO") ? "carbamate" : type.includes("X") ? "carbonylhalide" : "urea";
    this.mark(c, kind, []);
    ls.forEach((x, k) => { this.group[x] = kind; if (type[k] === "OR" && !this.esterO.has(c)) this.esterO.set(c, x); });
    for (const x of ls) if (el[x] === "N") for (const j of adj[x]) if (this.nOxy(x, j)) this.nO.add(j); // N-hydroxyurea
  }
  // An OH or O-alkyl on an amide-like N (N-hydroxy, N-methoxy: hydroxamic acids, Weinreb amides, hydroxyurea).
  nOxy(n: number, o: number): boolean {
    return this.el[o] === "O" && this.ord(n, o) === 1 && !this.q[o] && !this.inRing[o]
      && (this.adj[o].length === 1 ? this.h[o] === 1 : this.adj[o].length === 2 && this.adj[o].every((j) => j === n || (this.el[j] === "C" && this.carbonylO[j] < 0)));
  }
  // The N' of a hydrazide R-C(=O)-NH-NH2 (P-66.3.1), x being its N: not in a ring, every other atom on N and N' carbon.
  hydrazideN(c: number, x: number): number | undefined {
    const { el, adj } = this;
    if (el[x] !== "N" || this.ord(c, x) !== 1 || this.inRing[x] || this.q[x]) return undefined;
    const ys = adj[x].filter((j) => j !== c && el[j] !== "C"), y = ys[0];
    if (ys.length !== 1 || el[y] !== "N" || this.ord(x, y) !== 1 || this.inRing[y] || this.q[y]) return undefined;
    const carbon = (n: number, not: number) => adj[n].every((j) => j === not || (el[j] === "C" && !this.isNitrileC(j)));
    return carbon(x, y) && carbon(y, x) ? y : undefined;
  }
  // The N atoms of carbon c (with no carbon) that belong to a hydrazine or diazene, N-N or N=N with only carbon on them.
  hydrazineN(c: number): number[] {
    const { el, adj } = this;
    const ok = (n: number) => el[n] === "N" && !this.inRing[n] && !this.q[n];
    return adj[c].filter((n) => {
      if (!ok(n) || this.ord(c, n) !== 1) return false;
      const ms = adj[n].filter((j) => el[j] !== "C"), m = ms[0];
      return ms.length === 1 && ok(m) && adj[m].every((j) => j === n || (el[j] === "C" && !this.isNitrileC(j))) && adj[n].every((j) => j === m || (el[j] === "C" && !this.isNitrileC(j)));
    });
  }
  // A carboxylic acid group on a hydrazine or diazene N: the N-N is the parent (P-68.3.1.1.1, P-66.1.6.1.2):
  // hydrazinecarboxamide (semicarbazide), tert-butyl hydrazinecarboxylate, diethyl diazene-1,2-dicarboxylate.
  hydrazineGroup(c: number, n: number, x: number) {
    const { el, adj } = this;
    const r = adj[x].find((j) => j !== c);
    const kind: Kind | undefined = HALO[el[x]] && adj[x].length === 1 ? "halide" : el[x] === "O" && adj[x].length === 1 && this.h[x] === 1 ? "acid"
      : el[x] === "O" && adj[x].length === 2 && ((el[r!] === "C" && this.carbonylO[r!] < 0) || this.ringNO(x)) ? "ester"
      : el[x] === "N" && this.ord(c, x) === 1 && !this.inRing[x] && !this.q[x] && adj[x].every((j) => j === c || (el[j] === "C" && !this.isNitrileC(j)) || this.nOxy(x, j)) ? "amide" : undefined;
    if (!kind) throw new Error("carbonic acid derivative");
    this.mark(c, kind, [n]);
    this.group[x] = kind;
    if (kind === "ester") this.esterO.set(c, x);
    for (const j of adj[x]) if (kind === "amide" && this.nOxy(x, j)) this.nO.add(j);
    this.hzN.add(n);
    this.hzN.add(adj[n].find((j) => el[j] === "N")!);
  }
  // C(=O)-O-O (P-65.1.4.1): a peroxy acid (benzenecarboperoxoic acid), its ester (tert-butyl ethaneperoxoate), or a
  // diacyl peroxide (dibenzoyl peroxide).
  peroxyGroup(c: number, cs: number[], x: number, y: number) {
    const r = this.adj[y].find((j) => j !== x);
    const kind: Kind | undefined = r === undefined ? (this.h[y] === 1 ? "peroxy" : undefined) : this.el[r] !== "C" ? undefined
      : this.carbonylO[r] < 0 ? "peroxyester" : this.inRing[r] ? undefined : "peroxide";
    if (!kind || this.inRing[x] || this.adj[y].length > 2) throw new Error("carbonyl group");
    this.mark(c, kind, cs);
    this.group[x] = this.group[y] = kind;
    this.peroxO.add(x);
    this.peroxO.add(y);
    if (kind === "peroxyester") this.esterO.set(c, y);
  }
  // Diacyl peroxides (P-65.7): dibenzoyl peroxide, acetyl benzoyl peroxide.
  peroxideName(): string {
    const cs = [...this.bearer.keys()].filter((g) => this.group[g] === "peroxide");
    if (cs.length !== 2) throw new Error("peroxide");
    const acyls = cs.map((c) => this.acylName(c, this.groupHetero(c).find((j) => this.peroxO.has(j))!));
    if (acyls[0].text === acyls[1].text) return `${times(2, acyls[0])} peroxide`;
    return `${acyls.map((a) => enclose(a)).sort((a, b) => alphaKey(a).localeCompare(alphaKey(b))).join(" ")} peroxide`;
  }
  // An ester O on a ring N (P-65.6.3.2.3): 2,5-dioxopyrrolidin-1-yl acetate, the N-hydroxysuccinimide esters.
  ringNO = (o: number) => this.adj[o].some((j) => this.el[j] === "N" && this.inRing[j] && !this.q[j] && this.ord(o, j) === 1);
  // Bonds between heteroatoms that these classes allow: N-O of N-hydroxy amides and of esters on a ring N, N-N of
  // hydrazides.
  classBond = (a: number, b: number) => this.nO.has(a) || this.nO.has(b) || (this.group[a] === "hydrazide" && this.group[b] === "hydrazide" && this.el[a] === "N" && this.el[b] === "N") || (this.hzN.has(a) && this.hzN.has(b)) || (this.peroxO.has(a) && this.peroxO.has(b)) || (this.pseudo.has(a) && this.pseudo.has(b))
    || [a, b].some((o) => this.el[o] === "O" && (this.group[o] === "ester" || this.group[o] === "carbamate") && this.ringNO(o));
  // Groups cited only as prefixes (P-61, P-65.2.2): N=C=O and N=C=S on N (isocyanato, isothiocyanato), N#C-O and
  // N#C-S on O or S (cyanato, thiocyanato). With H in place of the attachment, the molecule is the acid: isocyanic acid.
  pseudoGroup(c: number): boolean {
    const { el, adj } = this;
    if (this.inRing[c] || this.q[c] || adj[c].length !== 2) return false;
    for (const [n, x] of [adj[c], [...adj[c]].reverse()]) {
      if (el[n] !== "N" || (el[x] !== "O" && el[x] !== "S") || this.q[n] || this.q[x] || this.inRing[n] || this.inRing[x]) continue;
      const iso = this.ord(c, n) === 2 && this.ord(c, x) === 2 && adj[x].length === 1;
      const cyan = this.ord(c, n) === 3 && this.ord(c, x) === 1 && adj[n].length === 1;
      if (!iso && !cyan) continue;
      const at = iso ? n : x, words = iso ? ["isocyanato", "isothiocyanato", "isocyanic acid", "isothiocyanic acid"] : ["cyanato", "thiocyanato", "cyanic acid", "thiocyanic acid"];
      const k = el[x] === "O" ? 0 : 1;
      if (adj[at].length === 1 && this.h[at] === 1) this.whole = words[k + 2];
      else if (adj[at].length !== 2 || this.h[at] || this.ord(at, adj[at].find((j) => j !== c)!) !== 1) continue;
      else this.prefixOnly.set(at, words[k]);
      for (const a of [c, n, x]) this.pseudo.add(a);
      return true;
    }
    return false;
  }
  // C=N with N or N=C (P-66.4.1, P-66.4.1.2.1, P-62.3.1.1): amidines (ethanimidamide, piperidine-1-carboximidamide),
  // guanidines and carbodiimides (methanediimine).
  amidineGroup(c: number, n: number, cs: number[], rest: number[]) {
    const { el, adj } = this;
    const plain = (x: number) => el[x] === "N" && this.ord(c, x) === 1 && !this.inRing[x] && !this.q[x] && adj[x].every((j) => j === c || el[j] === "C" || this.nOxy(x, j));
    for (const x of rest) if (plain(x)) for (const j of adj[x]) if (this.nOxy(x, j)) this.nO.add(j); // N-hydroxyguanidine, amidoximes
    const m = rest[0];
    if (!cs.length && rest.length === 1 && el[m] === "N" && this.ord(c, m) === 2 && !this.inRing[m] && !this.q[m] && adj[m].length + this.h[m] === 2
      && adj[m].every((j) => j === c || (el[j] === "C" && this.carbonylO[j] < 0 && !this.isNitrileC(j)))) {
      this.mark(c, "imine", []);
      this.group[n] = this.group[m] = "imine";
      this.diimine.add(c);
      return;
    }
    // Isoureas and other imidic carbonic acid derivatives (P-65.2.1.2): carbamimidic acid, methyl carbamimidate.
    if (!cs.length && rest.length === 2 && !rest.every(plain)) { this.carbonicGroup(c, rest); this.group[n] = "imine"; return; }
    // Imidic acids, imidates and imidoyl halides (P-65.1.3.1): ethanimidic acid, methyl ethanimidate.
    const x = rest[0], r = adj[x].find((j) => j !== c);
    const one: Kind | undefined = plain(x) ? "amidine" : el[x] === "O" && adj[x].length === 1 && this.h[x] === 1 ? "imidic"
      : el[x] === "O" && adj[x].length === 2 && ((el[r!] === "C" && this.carbonylO[r!] < 0) || this.ringNO(x)) ? "imidate" : HALO[el[x]] && adj[x].length === 1 ? "imidoylhalide" : undefined;
    const kind: Kind | undefined = cs.length <= 1 && rest.length === 1 ? one : !cs.length && rest.length === 2 ? "guanidine" : undefined;
    if (!kind) throw new Error("imine");
    this.mark(c, kind, cs);
    this.group[n] = "imine";
    for (const y of rest) this.group[y] = kind;
    if (kind === "imidate") this.esterO.set(c, x);
  }
  // Ring N atoms single-bonded to carbon c, when c is outside a ring.
  ringN = (c: number) => (this.inRing[c] ? [] : this.adj[c].filter((j) => this.el[j] === "N" && this.inRing[j] && this.ord(c, j) === 1 && !this.q[j]));
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
    if (this.el[x] === "C" && this.carbonylO[x] < 0) return n; // N-cyano too: N''-cyanoguanidine
    if (this.el[x] === "O" && !this.q[x] && this.adj[x].length + this.h[x] === 2 && this.adj[x].every((j) => j === n || (this.el[j] === "C" && this.carbonylO[j] < 0))) return n;
    return undefined;
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
    const ring = RINGS[`${size}${aromatic ? "a" : "s"}:${sig.join(",")}`];
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
      if (this.el[a] === "C" || this.el[a] === "N") { cn.push(a); if (!doubles) d.push(a); }
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
    if (bonds.length !== atoms.length + 1 || atoms.some((a) => !["C", "N", "O", "S"].includes(this.el[a]) || (this.el[a] !== "C" && this.q[a]))) return undefined;
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
    const xs = f.tpl.odd ? byLoc(ketones.length % 2 ? ketones : f.d) : [undefined];
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
  nameParent(p: Parent, opts: { kind?: Kind; attach?: [number, number]; acyl?: boolean; sulfo?: string; skip?: Set<number>; tiebreak?: (nums: number[][]) => number[][] }): Name & { score: number[]; label?: (a: number) => string } {
    const { atoms } = p, inParent = new Set(atoms), kind = opts.kind;
    const skip = opts.skip ?? new Set<number>();
    const info = p.hetero ? ({ numberings: [atoms, [...atoms].reverse()], aromatic: false } as ReturnType<Namer["ringInfo"]>)
      : p.assembly ? this.assemblyInfo(p.assembly) : p.ring ? this.ringInfo(atoms) : undefined;
    const numberings = p.ring ? info!.numberings : [atoms, [...atoms].reverse()];
    // Suffix sites: the parent atom each principal group sits on (a chain's own functional carbon, or the ring atom
    // a functional carbon hangs on), and the group atoms used up by the suffix.
    const sites: { atom: number; group: number }[] = [];
    const used = new Set<number>();
    if (kind) {
      for (const [g, on] of this.bearer) {
        if (this.group[g] !== kind || skip.has(g)) continue;
        if (CARBON_GROUP.has(kind)) {
          if (inParent.has(g) && !p.ring && !p.attached) sites.push({ atom: g, group: g });
          else if ((p.ring || p.attached) && on.some((a) => inParent.has(a))) { sites.push({ atom: on.find((a) => inParent.has(a))!, group: g }); used.add(g); }
        } else if (kind === "ketone" || kind === "imine") { if (inParent.has(g)) { sites.push({ atom: g, group: g }); used.add(kind === "ketone" ? this.carbonylO[g] : this.imineN(g)!); } }
        else { const a = on.find((x) => inParent.has(x)); if (a !== undefined) { sites.push({ atom: a, group: g }); used.add(g); } }
      }
    }
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
    // An amidine's amino N is N, its imino N is N' (P-66.4.1.3): N'-hydroxyethanimidamide. A hydrazide's second N is
    // N' (P-66.3.1.2): N'-phenylacetohydrazide.
    const prime = new Set<{ atom: number; name: Name; n?: boolean }>();
    for (const s of sites) {
      const amideN = this.groupHetero(s.group).find((j) => !this.inRing[j] && this.ord(s.group, j) === 1 && !this.bearer.get(s.group)!.includes(j));
      const nAtom = kind === "amide" || kind === "amidine" || kind === "hydrazide" ? amideN : kind === "amine" || kind === "aminium" ? s.group : kind === "imine" || kind === "imidic" || kind === "imidate" || kind === "imidoylhalide" ? this.imineN(s.group) : undefined;
      const second = kind === "amidine" ? this.imineN(s.group) : kind === "hydrazide" ? this.hydrazideN(s.group, nAtom!) : undefined;
      for (const a of second !== undefined ? [nAtom!, second] : nAtom === undefined ? [] : [nAtom])
        for (const x of this.adj[a]) if (x !== s.group && !inParent.has(x) && x !== s.atom && x !== second && x !== nAtom) {
          prefixes.push({ atom: s.atom, name: this.substituent(x, a), n: true });
          if (a !== nAtom) prime.add(prefixes[prefixes.length - 1]);
        }
    }
    if (prime.size && sites.length > 1) throw new Error("several amidines");
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
    if (opts.acyl && !p.ring) nums = nums.filter((num) => num[0] === atoms[0]);
    nums = this.lowest(nums, (num) => sites.map((s) => loc(num, s.atom)));
    if (fused) {
      nums = this.lowest(nums, (num) => one(sat(num).y).map((a) => loc(num, a)));
      nums = this.lowest(nums, (num) => sat(num).hydro.map((a) => loc(num, a)));
    }
    nums = this.lowest(nums, (num) => multiple(num));
    nums = this.lowest(nums, (num) => multiple(num, 2));
    nums = this.lowest(nums, (num) => counted.map((x) => loc(num, x.atom)));
    const alpha = [...new Set(counted.map((x) => x.name.text))].sort((a, b) => alphaKey(a).localeCompare(alphaKey(b)));
    for (const t of alpha) nums = this.lowest(nums, (num) => counted.filter((x) => x.name.text === t).map((x) => loc(num, x.atom)));
    if (opts.tiebreak) nums = opts.tiebreak(nums);
    const num = nums[0];

    // Assemble (P-14, P-16): prefixes in alphabetical order, then the parent, unsaturation and suffix.
    const size = atoms.length;
    const retainedKey = info?.ring ? `${info.ring.name}:${kind}` : !p.ring && !p.attached ? `C${size}:${kind}` : "";
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
    const prefixText = assemblePrefixes(prefixes.map((x) => ({ loc: x.n ? (manyN ? `N${label(num, x.atom)}` : prime.has(x) ? "N'" : "N") : label(num, x.atom), name: x.name })),
      // An amide's N is a position too: 2-chloro-N-methylacetamide (P-14.3.4).
      (retained && !p.ring && size === 2 && !(prefixes.some((x) => x.n) && prefixes.some((x) => !x.n))) || (!p.ring && size === 1) ||
      (!!opts.acyl && !p.ring && size === 2 && !multiple(num).length) || // phenylacetyl, chloroacetyl
      (single && prefixes.length + sites.length <= 1 && !opts.attach && !multiple(num).length));
    let parent: string;
    if (p.hetero) parent = p.hetero; // hydrazine, diazene
    else if (retained) parent = retained;
    else if (fused) {
      // Hydro prefixes, then indicated hydrogen, in front of the parent (P-31.1.4.2.4): 2,3-dihydro-1H-indole.
      const { x, hydro } = sat(num);
      const h = !hydro.length ? "" : `${hydro.length === fused.cn.length ? "" : hydro.map((a) => label(num, a)).join(",") + "-"}${HYDRO[hydro.length]}hydro`;
      parent = joinPrefixes(h, (x === undefined ? "" : `${label(num, x)}H-`) + fused.tpl.name);
    } else if (assembly) {
      // 1,1'-biphenyl; in brackets before a suffix: [1,1'-biphenyl]-4-carboxylic acid.
      const junction = [...assembly.junction].sort((a, b) => loc(num, a) - loc(num, b)).map((a) => label(num, a)).join(",");
      parent = kind || opts.attach ? `[${junction}-${assembly.stem}]` : `${junction}-${assembly.stem}`;
    } else if (p.ring && info!.ring) parent = (info!.ring.hydrogen && (!opts.attach || opts.sulfo || opts.acyl) ? info!.ring.hydrogen : "") + info!.ring.name;
    else if (bridged) {
      if (multiple(num).some((l) => l > 999)) throw new Error("bridgehead double bond");
      // Replacement prefixes in front: 8-azabicyclo[3.2.1]octane, 1,4-dioxaspiro[4.5]decane.
      const replaced = REPLACE.map(([e, word]) => {
        const at = atoms.filter((a) => this.el[a] === e).map((a) => loc(num, a)).sort((a, b) => a - b);
        return at.length ? `${at.join(",")}-${MULT[at.length]}${word}` : "";
      }).filter(Boolean).join("-");
      parent = (replaced ? `${replaced}${/^\d/.test(bridged.prefix) ? "-" : ""}` : "") + bridged.prefix + chainStem(size, multiple(num, 2), multiple(num, 3), true);
    }
    else parent = (p.ring ? "cyclo" : "") + chainStem(size, multiple(num, 2), multiple(num, 3), p.ring);
    // A ring cation (P-73.1.2): pyridin-1-ium, 1-methylpyridin-1-ium, acridin-10-ium. Not with a suffix or as a prefix.
    const ium = p.ring ? atoms.filter((a) => this.cationN(a)) : [];
    if (ium.length) {
      if (kind || opts.attach || retained) throw new Error("ring cation");
      parent = `${parent.replace(/e$/, "")}-${ium.map((a) => label(num, a)).sort(locOrder).join(",")}-${MULT[ium.length]}ium`;
    }
    let text: string;
    const locantFree = p.ring && !fused && !assembly && !bridged && (!info?.ring || info.ring.name === "benzene") && prefixes.every((x) => x.n); // N-substituents need no ring locant: N-methylcyclohexanecarboxamide
    if (opts.sulfo) text = joinPrefixes(prefixText, withSuffix(parent, undefined, [label(num, opts.attach![0])], p.ring, locantFree, !p.ring && size <= 2, opts.sulfo));
    else if (opts.attach) text = joinPrefixes(prefixText, this.substituentForm(parent, info, label(num, opts.attach[0]), p.ring, size, !!opts.acyl, multiple(num).length > 0));
    else if (retained) text = prefixText + retained; // benzoic acid, acetic acid: the suffix locant is understood
    else text = joinPrefixes(prefixText, withSuffix(parent, kind, sitesLoc, p.ring || !!p.attached, locantFree, !p.ring && !p.attached && size <= 2));
    if (p.attached && size === 1) text = text.replace(/methane-1(,1)+-/, "methane"); // methanetricarboxylic acid
    // Stereodescriptors (P-91, P-93): R and S on the parent's atoms, E and Z on its double bonds, in locant order,
    // in front of everything they belong to.
    const stereo: { at: number; text: string }[] = [];
    for (const a of atoms) if (this.cip[a] === "R" || this.cip[a] === "S") stereo.push({ at: loc(num, a), text: `${label(num, a)}${this.cip[a]}` });
    // E and Z on an imine's C=N, at the carbon's locant: (1E)-N-hydroxyethanimine.
    if (kind === "imine") for (const st of sites) { const c = this.cipBond.get(this.key(st.atom, this.imineN(st.atom)!)); if (c === "E" || c === "Z") stereo.push({ at: loc(num, st.atom), text: `${label(num, st.atom)}${c}` }); }
    // Likewise on the C=N of an amidine, imidic acid, imidate or imidoyl halide that ends a chain: (1Z)-N'-hydroxyethanimidamide.
    if (kind && ["amidine", "imidic", "imidate", "imidoylhalide"].includes(kind) && !p.ring && !p.attached) for (const st of sites) {
      const c = this.cipBond.get(this.key(st.group, this.imineN(st.group)!));
      if (c === "E" || c === "Z") stereo.push({ at: loc(num, st.atom), text: `${label(num, st.atom)}${c}` });
    }
    if (fused || assembly) {
      if (atoms.some((a) => this.adj[a].some((b) => inParent.has(b) && /^[EZ]$/.test(this.cipBond.get(this.key(a, b)) ?? "")))) throw new Error("ring E/Z");
    } else if (p.hetero) {
      const e = this.cipBond.get(this.key(atoms[0], atoms[1])); // (E)-diazene-1,2-dicarboxylate
      if (e === "E" || e === "Z") stereo.push({ at: 0, text: e });
    } else for (let k = 0; k + 1 < num.length + (p.ring ? 1 : 0); k++) {
      const c = this.cipBond.get(this.key(num[k], num[(k + 1) % num.length]));
      if (c === "E" || c === "Z") stereo.push({ at: k + 1, text: `${k + 1}${c}` });
    }
    if (stereo.length) text = `(${stereo.sort((x, y) => x.at - y.at).map((x) => x.text).join(",")})-${text}`;
    // A prefix needs brackets when it carries prefixes of its own or locants (P-16.5.1).
    return { text, compound: prefixes.length > 0 || /[\d,]/.test(text), score: [], label: (a: number) => label(num, a) };
  }
  groupHetero = (c: number) => this.adj[c].filter((j) => j !== this.carbonylO[c] && this.el[j] !== "C");

  // The ring or chain stem as a substituent prefix: phenyl, pyridin-3-yl, cyclohexyl, propan-2-yl, acetyl.
  substituentForm(parent: string, info: ReturnType<Namer["ringInfo"]> | undefined, at: string, ring: boolean, size: number, acyl: boolean, unsaturated: boolean): string {
    if (info?.fused) return acyl ? `${parent}-${at}-carbonyl` : `${parent.replace(/e$/, "")}-${at}-yl`; // 1H-indol-3-yl
    if (acyl) {
      if (ring) return parent === "benzene" ? "benzoyl" : `${parent}-${at}-carbonyl`;
      if (size === 2 && parent === "ethane") return "acetyl";
      if (size === 1) return "carbonyl"; // a substituted formyl: carboxycarbonyl (P-65.1.7.2.2)
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
    const only = this.prefixOnly.get(x);
    if (only) return { text: only, compound: false };
    const imidoyl = this.imidoylPrefix(x, from);
    if (imidoyl) return imidoyl;
    // Rings with a free valence, on a ring carbon or a ring nitrogen (piperidin-1-yl).
    if (this.inRing[x]) return this.nameParent({ atoms: this.rings[this.ringOf[x]], ring: true }, { attach: [x, from] });
    // Groups Octet does not yet cite as prefixes.
    const g = this.group[x];
    if (g === "sulfonylhalide" || g === "aminium" || this.peroxO.has(x)) throw new Error(`${g} as a prefix`);
    // A carbonyl carbon reached from its own N or O is an acyl group: N-acetyl, carbamoyl, (methoxycarbonyl)oxy.
    if (el === "C" && this.carbonylO[x] >= 0 && this.groupHetero(x).includes(from) && !this.inRing[from]) return this.acylName(x, from);
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
        return { text: `${enclose(acyl)}oxy`, compound: true };
      }
      const alkyl = this.substituent(r, x);
      const simple: Record<string, string> = { methyl: "methoxy", ethyl: "ethoxy", propyl: "propoxy", butyl: "butoxy", phenyl: "phenoxy", "tert-butyl": "tert-butoxy", benzyl: "benzyloxy", phenylmethyl: "benzyloxy" };
      if (simple[alkyl.text]) return { text: simple[alkyl.text], compound: simple[alkyl.text] === "benzyloxy" };
      // Methoxy, ethoxy, propoxy, butoxy and phenoxy keep their short form when substituted (P-63.2.2.2):
      // 2-chloroethoxy, (9H-fluoren-9-yl)methoxy, 4-nitrophenoxy.
      if (/(?<!cyclo)(meth|eth|prop|but|phen)yl$/.test(alkyl.text)) return { text: alkyl.text.replace(/yl$/, "oxy"), compound: true };
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
      // A hydrazide's N-N as a prefix (P-68.3.1.2.1): hydrazinyl, 2-phenylhydrazinyl, 2-acetylhydrazinyl.
      const m = this.group[x] === "hydrazide" ? others.find((j) => this.el[j] === "N" && this.group[j] === "hydrazide") : undefined;
      if (m !== undefined) {
        const sub = (j: number, n: number) => (this.carbonylO[j] >= 0 ? this.acylName(j, n) : this.substituent(j, n));
        const subs = [...others.filter((j) => j !== m).map((j) => ({ loc: "1", name: sub(j, x) })), ...this.adj[m].filter((j) => j !== x).map((j) => ({ loc: "2", name: sub(j, m) }))];
        return { text: joinPrefixes(assemblePrefixes(subs, false), "hydrazinyl"), compound: subs.length > 0 };
      }
      if (acyl.length === 1 && others.length === 1) {
        const an = this.acylName(acyl[0], x), a = an.text;
        const retained: Record<string, string> = { acetyl: "acetamido", benzoyl: "benzamido", formyl: "formamido" };
        // Carbonic acyl groups keep their own brackets: carboxyamino, carbamoylamino, [(methoxycarbonyl)amino].
        const carbonic = !this.carbons(acyl[0]).length && !this.ringN(acyl[0]).length;
        return { text: retained[a] ?? `${enclose(carbonic ? an : { text: a, compound: true })}amino`, compound: !retained[a] };
      }
      // N-acyl, N-alkyl: acetyl(methyl)amino, diacetylamino.
      const subs = others.map((j) => (this.carbonylO[j] >= 0 ? this.acylName(j, x) : this.substituent(j, x)));
      if (!subs.length) return { text: "amino", compound: false };
      if (subs.length === 1) return { text: subs[0].text === "phenyl" ? "anilino" : `${enclose(subs[0])}amino`, compound: subs[0].text !== "phenyl" };
      // dimethylamino, bis(carboxymethyl)amino, (2-chloroethyl)(methyl)amino, with brackets nested as they should be.
      return { text: `${substituted(subs)}amino`, compound: true };
    }
    if (el !== "C") throw new Error("substituent");
    // Functional carbons cited as prefixes.
    const kind = this.group[x];
    if (kind === "acid") return { text: "carboxy", compound: false };
    if (kind === "aldehyde") return { text: "formyl", compound: false };
    if (kind === "nitrile") return { text: "cyano", compound: false };
    if (kind === "hydrazide") {
      // Hydrazinecarbonyl (P-66.3.2); with substituents on its N atoms, not yet.
      const n = this.groupHetero(x).find((j) => this.group[j] === "hydrazide")!, m = this.hydrazideN(x, n);
      if (this.adj[n].length !== 2 || m === undefined || this.adj[m].length !== 1) throw new Error("hydrazide as a prefix");
      return { text: "hydrazinecarbonyl", compound: true };
    }
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
      return { text: `${enclose(alkoxy)}carbonyl`, compound: true }; // methoxycarbonyl, [(benzyloxy)carbonyl]
    }
    if (this.carbonylO[x] >= 0) return this.acylName(x, from);
    // tert-butyl and benzyl are retained prefixes (P-29.6).
    const methyls = this.carbons(x, [from]).filter((j) => this.h[j] === 3 && this.adj[j].length === 1);
    if (methyls.length === 3 && this.adj[x].length === 4) return { text: "tert-butyl", compound: false };
    const chain = this.bestChain(x, from);
    return this.nameParent({ atoms: chain, ring: false }, { attach: [x, from] });
  }

  // Prefixes for amidine, guanidine and carbodiimide groups (P-66.4.1.2.1.3): carbamimidoyl on its carbon,
  // carbamimidamido and (diaminomethylidene)amino on an N, [(ethylimino)methylidene]amino on a carbodiimide's N.
  // Undefined for anything else.
  imidoylPrefix(x: number, from: number): Name | undefined {
    const plain = (c: number) => this.adj[c].every((j) => j === x || j === from || (this.el[j] === "N" && this.adj[j].length === 1));
    if (this.el[x] === "C" && (this.group[x] === "amidine" || this.group[x] === "guanidine") && plain(x)) return { text: "carbamimidoyl", compound: false };
    if (this.el[x] !== "N" || this.adj[x].length !== 2) return undefined;
    const c = this.adj[x].find((j) => j !== from)!;
    if (this.diimine.has(c)) {
      const e = enclose(this.iminoPrefix(this.adj[c].find((j) => j !== x)!, c));
      return { text: e.startsWith("(") ? `[${e}methylidene]amino` : `(${e}methylidene)amino`, compound: true };
    }
    if (this.group[c] !== "guanidine") return undefined;
    if (this.ord(x, c) === 1) return plain(c) ? { text: "carbamimidamido", compound: false } : undefined;
    const subs = this.adj[c].filter((j) => j !== x).map((j) => this.substituent(j, c));
    return { text: `(${substituted(subs)}methylidene)amino`, compound: true };
  }
  // The prefix for =N on a parent atom: imino, (hydroxyimino), (methylimino).
  iminoPrefix(n: number, c: number): Name {
    const x = this.adj[n].find((j) => j !== c);
    return x === undefined ? { text: "imino", compound: false } : { text: `${enclose(this.substituent(x, n))}imino`, compound: true };
  }
  // An acyl group: the carbonyl carbon c joined (at its free valence) to `from`.
  acylName(c: number, from: number): Name {
    // C(=O) with a heteroatom besides `from` is named from it (P-65.1.7.4, P-65.2.1.5, P-65.5.2): carboxy,
    // tert-butoxycarbonyl, [(benzyloxy)carbonyl], carbamoyl, dimethylcarbamoyl, chlorocarbonyl.
    const rN = this.ringN(c), y = this.groupHetero(c).find((j) => j !== from && !rN.includes(j) && this.ord(c, j) === 1);
    if (y !== undefined) {
      if (HALO[this.el[y]] || this.prefixOnly.has(y)) return { text: `${HALO[this.el[y]] ?? this.prefixOnly.get(y)}carbonyl`, compound: true };
      if (this.el[y] === "O" && this.adj[y].length === 1) return { text: "carboxy", compound: false };
      if (this.el[y] === "O") return { text: `${enclose(this.substituent(y, c))}carbonyl`, compound: true };
      if (this.el[y] !== "N") throw new Error("acyl");
      const subs = this.adj[y].filter((j) => j !== c).map((j) => this.substituent(j, y));
      return { text: `${substituted(subs)}carbamoyl`, compound: subs.length > 0 };
    }
    const r = [...this.carbons(c, [from]), ...rN.filter((j) => j !== from)];
    if (!r.length) return { text: "formyl", compound: false };
    if (this.inRing[r[0]]) {
      const cycle = this.rings[this.ringOf[r[0]]];
      return this.nameParent({ atoms: cycle, ring: true }, { attach: [r[0], c], acyl: true });
    }
    const chain = this.bestChain(c, from, true);
    return this.nameParent({ atoms: chain, ring: false }, { attach: [c, from], acyl: true });
  }

  // Acyclic carbon paths (no ring atoms) through or from `start`, not crossing `from`. A nitrile's carbon is in a chain
  // only when the chain is named with the -nitrile suffix; else it is cyano (ethyl cyanoacetate, P-66.5.1.2).
  paths(start: number, from: number, fromStart: boolean, nitrile = false, avoid?: Set<number>): number[][] {
    const ok = (j: number) => this.el[j] === "C" && !this.inRing[j] && j !== from && (nitrile || !this.isNitrileC(j)) && !avoid?.has(j);
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
    // An acid's carbon is never in a substituent chain: carboxymethyl (P-65.1.2.3), not 2-hydroxy-2-oxoethyl.
    const acids = new Set([...this.bearer.keys()].filter((g) => this.el[g] === "C" && (this.group[g] === "acid" || this.group[g] === "peroxy") && g !== x));
    return this.paths(x, from, fromStart, false, acids).sort((a, b) => compare(score(a), score(b)))[0];
  }

  // ——— The whole molecule ———
  name(): string | undefined {
    this.perceive();
    if (this.adj.some((a, i) => a.length === 0 && this.el[i] !== "C") || this.n === 0) return undefined;
    const kind = SENIORITY.find((k) => this.group.includes(k) && [...this.bearer.keys()].some((g) => this.group[g] === k));
    let text: string | undefined;
    if (kind === "ester" || kind === "imidate" || kind === "peroxyester") text = this.esterName(kind);
    else if (kind === "peroxide") text = this.peroxideName();
    else if (kind === "anhydride") text = this.anhydrideName();
    else if (this.whole && this.pseudo.size === this.n) text = this.whole;
    else if (kind === "urea" || kind === "carbamate" || kind === "carbonic" || kind === "carbonylhalide" || kind === "guanidine" || (kind === "imine" && this.diimine.size)
      || (kind === "nitrile" && [...this.bearer].every(([g, on]) => this.group[g] !== "nitrile" || (!on.length && this.groupHetero(g).length === 2)))) text = this.carbonicName(kind);
    else if (!kind && this.phosphorus.size) text = this.phosphaneName();
    else {
      text = this.parentName(kind)?.text;
      // Acid halides (P-65.5.1): acetyl chloride, butanedioyl dichloride, methanesulfonyl chloride.
      if (text && (kind === "halide" || kind === "sulfonylhalide" || kind === "imidoylhalide")) {
        const xs = [...Array(this.n).keys()].filter((x) => (HALO[this.el[x]] || this.prefixOnly.has(x)) && this.adj[x].some((j) => this.group[j] === kind));
        const word = (x: number) => HALIDE[this.el[x]] ?? this.prefixOnly.get(x)!.replace(/o$/, "e"); // isothiocyanato → isothiocyanate
        if (new Set(xs.map(word)).size !== 1) throw new Error("mixed halides");
        text += ` ${MULT[xs.length]}${word(xs[0])}`;
      }
    }
    // Every stereo label must be cited (P-91): a name that drops one would be wrong, and labels other than R, S, E
    // and Z are not covered.
    const cited = citedLabels(text ?? "");
    const labelled = this.cip.filter(Boolean).length + [...this.cipBond.values()].filter(Boolean).length;
    if (text && cited !== labelled) throw new Error("stereo not cited");
    return text;
  }
  // Candidate parents: every acyclic carbon chain and every ring; the senior one wins (P-44).
  parentName(kind: Kind | undefined, skip = new Set<number>(), within?: Set<number>): (Name & { parent?: Parent; label?: (a: number) => string }) | undefined {
    const carbons = [...Array(this.n).keys()].filter((i) => this.el[i] === "C" && !this.inRing[i] && (!within || within.has(i)) && !skip.has(i) && !this.pseudo.has(i) && (kind === "nitrile" || !this.isNitrileC(i)));
    const chains: number[][] = [];
    for (const a of carbons) for (const p of this.paths(a, -1, true, kind === "nitrile")) if (p.every((i) => !skip.has(i) && (!within || within.has(i)))) chains.push(p);
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
    const cands: (Parent & { groups: number })[] = [
      ...this.rings.filter((r) => !within || r.every((a) => within.has(a))).map((r) => ({ atoms: r, ring: true, groups: count(r, true) })),
      ...chains.map((c) => ({ atoms: c, ring: false, groups: count(c, false) })),
    ];
    // More than two carboxylic groups on a chain cannot all end it: the chain without them carries every one as a
    // "carbo…" suffix (P-65.1.2.2.2): 2-hydroxypropane-1,2,3-tricarboxylic acid (citric acid).
    const own = new Set([...this.bearer.keys()].filter((g) => kind && CARBON_GROUP.has(kind) && this.group[g] === kind && !skip.has(g)));
    if (own.size > 2) for (const a of carbons) if (!own.has(a)) for (const p of this.paths(a, -1, true, false, own)) {
      const groups = count(p, true);
      if (groups > 2 && p.every((i) => !skip.has(i) && (!within || within.has(i)))) cands.push({ atoms: p, ring: false, attached: true, groups });
    }
    // A hydrazine or diazene bearing carboxylic acid groups is a parent, senior to carbon (P-44.1.2): named as a ring is,
    // with "carbo…" suffixes.
    for (const a of this.hzN) for (const b of this.adj[a]) if (a < b && this.hzN.has(b) && (!within || (within.has(a) && within.has(b))))
      cands.push({ atoms: [a, b], ring: true, groups: count([a, b], true), hetero: this.ord(a, b) === 2 ? "diazene" : "hydrazine" });
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
    const score = (c: Parent & { groups: number }) =>
      [-c.groups, c.ring ? 0 : 1, ...(c.ring ? [...ringRank({ atoms: c.assembly?.rings[0] ?? c.atoms }), c.assembly ? -2 : -1] : [-c.atoms.length, -multiple(c), -multiple(c, 2), 0, 0]), -subs(c)];
    cands.sort((a, b) => compare(score(a), score(b)));
    const best = cands.filter((c) => compare(score(c), score(cands[0])) === 0);
    // Equal parents: the name with the lowest locants (then first alphabetically) wins.
    const names = best.map((c) => ({ c, n: this.nameParent(c, { kind: c.groups ? kind : undefined, skip }) }));
    names.sort((a, b) => compare(locantsOf(a.n.text), locantsOf(b.n.text)) || a.n.text.localeCompare(b.n.text));
    // The chosen parent and its locants, for the names that cite them (1-ethyl 4-methyl butanedioate).
    return { text: names[0].n.text, compound: true, parent: names[0].c, label: names[0].n.label };
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
  esterName(kind: Kind): string | undefined {
    const esters = [...this.esterO.keys()].filter((c) => this.group[c] === kind);
    if (esters.length !== 1) return this.severalEsters(esters, kind);
    const c = esters[0], o = this.esterO.get(c)!, r = this.adj[o].find((j) => j !== c && !this.peroxO.has(j))!;
    const alkyl = this.substituent(r, o);
    // The acid side: everything reachable from the ester carbon without crossing the ester oxygen.
    const acid = this.parentName(kind, new Set(), this.side(c, o));
    if (!acid) return undefined;
    const acidText = acid.text.replace(/oic acid$/, "oate").replace(/carboxylic acid$/, "carboxylate").replace(/ic acid$/, "ate");
    return `${alkyl.text} ${acidText}`;
  }
  // Several esters (P-65.6.3.2). Esters of one polyol with one acid: propane-1,2,3-triyl triacetate. Else the
  // polyacid with the most ester groups names them, its alkyl groups in alphanumerical order, with the locants of
  // their acid groups when they differ: dimethyl butanedioate, 1-ethyl 4-methyl butanedioate. The other esters are
  // prefixes: methyl 4-(acetyloxy)benzoate, 4-methoxy-4-oxobutanoic acid (P-65.6.3.3).
  severalEsters(esters: number[], kind: Kind = "ester"): string {
    const polyol = this.polyolEster(esters);
    if (polyol) return polyol;
    const p = this.parentName(kind)?.parent;
    if (!p) throw new Error("several esters");
    const site = (c: number) => (p.ring || p.attached ? this.bearer.get(c)!.find((a) => p.atoms.includes(a)) : p.atoms.includes(c) ? c : undefined);
    const groups = new Map<string, { name: Name; sites: number[] }>();
    for (const c of esters) {
      const at = site(c);
      if (at === undefined) continue;
      const o = this.esterO.get(c)!, r = this.adj[o].find((j) => j !== c && !this.peroxO.has(j))!;
      if (p.atoms.some((a) => this.side(r, o).has(a))) throw new Error("cyclic ester");
      const name = this.substituent(r, o), g = groups.get(name.text) ?? { name, sites: [] };
      g.sites.push(at);
      groups.set(name.text, g);
    }
    // Low locants go to the alkyl group cited first (3-ethyl 5-methyl pyridine-3,5-dicarboxylate).
    const sorted = [...groups.values()].sort((a, b) => alphaKey(a.name.text).localeCompare(alphaKey(b.name.text)));
    const tiebreak = (nums: number[][]) => sorted.reduce((best, g) => this.lowest(best, (num) => g.sites.map((a) => num.indexOf(a) + 1)), nums);
    const acid = this.nameParent(p, { kind, tiebreak });
    const alkyls = sorted.map((g) => (sorted.length > 1 ? `${g.sites.map(acid.label!).sort(locOrder).join(",")}-` : "") + times(g.sites.length, g.name));
    return `${alkyls.join(" ")} ${acid.text}`;
  }
  // Esters of a polyol (P-65.6.3.2.2): cut at each ester's C–O bond, one part holds every ester O and no ester carbon,
  // and the acids are all the same: ethane-1,2-diyl diacetate. The polyol's name (ethane-1,2-diol) gives the
  // alkyl's (ethane-1,2-diyl).
  polyolEster(esters: number[]): string | undefined {
    const cut = new Set(esters.map((c) => this.key(c, this.esterO.get(c)!)));
    const part = (s: number) => {
      const seen = new Set([s]), stack = [s];
      while (stack.length) { const i = stack.pop()!; for (const j of this.adj[i]) if (!seen.has(j) && !cut.has(this.key(i, j))) { seen.add(j); stack.push(j); } }
      return seen;
    };
    const os = esters.map((c) => this.esterO.get(c)!), alcohol = part(os[0]);
    if (!os.every((o) => alcohol.has(o)) || esters.some((c) => alcohol.has(c))) return undefined;
    const acids = esters.map((c) => {
      const p = part(c);
      if (esters.some((d) => d !== c && p.has(d))) return undefined;
      return new Namer(this.piece([...p], [], [c])).name()?.replace(/oic acid$/, "oate").replace(/carboxylic acid$/, "carboxylate").replace(/ic acid$/, "ate");
    });
    if (!acids[0]?.endsWith("ate") || acids.some((a) => a !== acids[0])) return undefined;
    const diol = new Namer(this.piece([...alcohol], os)).name(), m = diol?.match(/(di|tri|tetra|penta|hexa)ol$/);
    if (!diol || !m || MULT.indexOf(m[1]) !== esters.length) return undefined;
    return `${diol.replace(/ol$/, "yl")} ${times(esters.length, { text: acids[0], compound: /[\d([ -]/.test(acids[0]) })}`;
  }
  // Some atoms as a structure of their own, with a hydrogen more on each of `addH` and an OH more on each of `addOH`.
  // Stereo labels are kept: they describe the whole structure, as the name does.
  piece(atoms: number[], addH: number[], addOH: number[] = []): Graph {
    const index = new Map(atoms.map((a, k) => [a, k]));
    const g: Graph = { atoms: atoms.map((a) => ({ el: this.el[a], charge: this.q[a], h: this.h[a] + (addH.includes(a) ? 1 : 0), ...(this.cip[a] ? { cip: this.cip[a] } : {}) })), bonds: [] };
    for (const [k, order] of this.bond) {
      const [a, b] = k.split(" ").map(Number), cip = this.cipBond.get(k);
      if (index.has(a) && index.has(b)) g.bonds.push({ a: index.get(a)!, b: index.get(b)!, order: order as 1 | 2 | 3, ...(cip ? { cip } : {}) });
    }
    for (const c of addOH) { g.atoms.push({ el: "O", charge: 0, h: 1 }); g.bonds.push({ a: index.get(c)!, b: g.atoms.length - 1, order: 1 }); }
    return g;
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
    if (cs.length === 1) return this.carbonicOne(cs[0], kind);
    // Dicarbonates (P-65.2.1.4): di-tert-butyl dicarbonate. Dicarbamates of a polyol: ethane-1,2-diyl dicarbamate.
    const di = this.dicarbonate(cs) ?? (kind === "carbamate" && cs.every((c) => this.esterO.has(c)) ? this.polyolEster(cs) : undefined);
    if (di) return di;
    // Else one group names the compound and the others are prefixes: the shortest such name (N,N'-dicarbamoylurea).
    let why: unknown;
    const names = cs.flatMap((c) => { try { return [this.carbonicOne(c, kind)]; } catch (e) { why ??= e; return []; } });
    if (!names.length) throw why; // the reason the first one gave: unknown ring
    return names.sort((a, b) => a.length - b.length || a.localeCompare(b))[0];
  }
  // Two carbonic acid groups that share an O: dicarbonic acid and its diesters.
  dicarbonate(cs: number[]): string | undefined {
    if (cs.length !== 2) return undefined;
    const [l1, l2] = cs.map((c) => this.groupHetero(c)), o = l1.find((x) => l2.includes(x));
    if (o === undefined) return undefined;
    const ends = [l1, l2].map((l) => l.find((x) => x !== o)!);
    if (ends.some((x) => this.el[x] !== "O")) return undefined;
    if (ends.every((x) => this.adj[x].length === 1)) return "dicarbonic acid";
    if (ends.some((x) => this.adj[x].length === 1)) return undefined;
    const alkyls = ends.map((x, k) => this.substituent(this.adj[x].find((j) => j !== cs[k])!, x));
    if (alkyls[0].text === alkyls[1].text) return `${times(2, alkyls[0])} dicarbonate`;
    return `${alkyls.map((a) => a.text).sort((a, b) => alphaKey(a).localeCompare(alphaKey(b))).join(" ")} dicarbonate`;
  }
  carbonicOne(c: number, kind: Kind): string {
    if (kind === "imine" && !this.diimine.has(c)) throw new Error("imine");
    // N and N' (a guanidine's imino N is N''): lowest locants, then low locants to the prefix cited first.
    const imidic = this.carbonylO[c] < 0 && kind !== "imine" && kind !== "nitrile";
    const imino = imidic ? this.imineN(c)! : undefined, last = imino === undefined ? [] : [imino];
    const ns = this.groupHetero(c).filter((j) => this.el[j] === "N" && j !== imino && (kind === "imine" || this.ord(c, j) === 1));
    const prefixes = [...ns, ...last].flatMap((n) => this.adj[n].filter((j) => j !== c).map((j) => ({ n, name: this.substituent(j, n) })));
    let nums = ns.length === 2 ? [[...ns, ...last], [ns[1], ns[0], ...last]] : [[...ns, ...last]];
    nums = this.lowest(nums, (num) => prefixes.map((x) => num.indexOf(x.n) + 1));
    for (const t of [...new Set(prefixes.map((x) => x.name.text))].sort((a, b) => alphaKey(a).localeCompare(alphaKey(b))))
      nums = this.lowest(nums, (num) => prefixes.filter((x) => x.name.text === t).map((x) => num.indexOf(x.n) + 1));
    const text = assemblePrefixes(prefixes.map((x) => ({ loc: ["N", "N'", "N''"][nums[0].indexOf(x.n)], name: x.name })), false);
    if (kind === "guanidine" || (kind === "urea" && !imidic)) return `${text}${kind}`;
    if (kind === "urea") throw new Error("imine");
    if (kind === "imine") return `${text}methanediimine`;
    // Carbamic acid, carbamates and carbamoyl halides; carbonic acid, carbonates, carbonochloridic acid and its esters,
    // and carbonyl dihalides (P-65.2.1, P-65.5.1).
    const ls = this.groupHetero(c), oh = ls.some((x) => this.el[x] === "O" && this.adj[x].length === 1);
    const alkyls = ls.filter((x) => this.el[x] === "O" && this.adj[x].length === 2).map((o) => this.substituent(this.adj[o].find((j) => j !== c)!, o));
    const xs = ls.filter((x) => HALO[this.el[x]]).map((x) => HALIDE[this.el[x]]).sort();
    if (kind === "nitrile") return ns.length ? `${text}cyanamide` : xs.length ? `carbononitridic ${xs[0]}` : "cyanic acid";
    const oxo = () => {
      if (ns.length) return kind === "carbonic" ? `${text}carbamic acid` : kind === "carbonylhalide" ? `${text}carbamoyl ${xs[0]}` : `${alkyls[0].text} ${text}carbamate`;
      if (xs.length) return oh ? `carbono${xs[0].slice(0, -1)}ic acid` : alkyls.length ? `${alkyls[0].text} carbono${xs[0].slice(0, -1)}ate` : xs[0] === xs[1] ? `${text}carbonyl di${xs[0]}` : `${text}carbonyl ${xs.join(" ")}`;
      if (oh) return alkyls.length ? `${alkyls[0].text} hydrogen carbonate` : "carbonic acid";
      if (alkyls[0].text === alkyls[1].text) return `${times(2, alkyls[0])} ${text}carbonate`;
      return `${alkyls.map((a) => a.text).sort((a, b) => alphaKey(a).localeCompare(alphaKey(b))).join(" ")} ${text}carbonate`;
    };
    // With =N in place of =O (P-65.2.1.2): carbamimidic acid, methyl carbamimidate, N-phenylcarbonimidoyl dichloride.
    const word = oxo();
    if (text && !word.includes(text)) throw new Error("imidic acid derivative");
    if (!imidic) return word;
    return word.replace(/carbamic acid$/, "carbamimidic acid").replace(/carbamate$/, "carbamimidate").replace(/carbamoyl /, "carbamimidoyl ")
      .replace(/carbonyl /, "carbonimidoyl ").replace(/(carbono\w+)ic acid$/, "$1imidic acid").replace(/(carbono\w+id)ate$/, "$1imidate")
      .replace(/carbonate$/, "carbonimidate").replace(/carbonic acid$/, "carbonimidic acid");
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
// The stereodescriptors a name cites, (2R,3S)- and the like, each counted as often as its multiplying prefix says:
// tris[(9Z)-octadec-9-enoate] cites three.
function citedLabels(text: string): number {
  const times = [1];
  let n = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === ")" || ch === "]" || ch === "}") { times.pop(); continue; }
    if (ch !== "(" && ch !== "[" && ch !== "{") continue;
    const m = text.slice(0, i).match(/(bis|tris|tetrakis|pentakis|hexakis|heptakis|octakis)$/), here = times[times.length - 1];
    const d = ch === "(" ? text.slice(i).match(/^\(([^()]*)\)-/) : null;
    if (d) n += here * d[1].split(",").filter((t) => /^(\d+[a-z]?'*)?[RSEZ]$/.test(t)).length;
    times.push(here * (m ? MULT_COMPLEX.indexOf(m[1]) : 1));
  }
  return n;
}
// Alphabetical order ignores multiplying prefixes of simple substituents, locants and italic prefixes (P-14.5).
function alphaKey(t: string): string {
  // Brackets and locants at the start, as often as they come: {2-[4-(hydroxymethyl)phenyl]hydrazinyl} sorts at h.
  for (let k = ""; k !== t; ) { k = t; t = t.replace(/^\((\d+[a-z]?'*)?[RSEZ](,(\d+[a-z]?'*)?[RSEZ])*\)-/, "").replace(/^[([{]/, "").replace(/^((tert|sec|N|\d+[a-z]?'*(,\d+[a-z]?'*)*)-)+/, "").replace(/^(\d+[a-z]?H-)+/, ""); }
  return t.replace(/[()[\]{}]/g, "");
}
// Substituents on a parent without locants (amino, phosphane): phenyl, diphenyl, methyl(diphenyl), in alphabetical order.
function substituted(subs: Name[]): string {
  const groups = new Map<string, { name: Name; n: number }>();
  for (const s of subs) groups.set(s.text, { name: s, n: (groups.get(s.text)?.n ?? 0) + 1 });
  const sorted = [...groups.values()].sort((a, b) => alphaKey(a.name.text).localeCompare(alphaKey(b.name.text)));
  const parts = sorted.map((g) => (g.n > 1 ? times(g.n, g.name) : enclose(g.name)));
  // After the first, each substituent goes in brackets: methyl(diphenyl)phosphane, ethyl(methyl)(phenyl)phosphane.
  return parts.map((t, k) => (k === 0 || /^[([{]/.test(t) ? t : `(${t})`)).join("");
}
// A name multiplied (P-16.9.1): dimethyl, di-tert-butyl, bis(2-chloroethyl).
function times(k: number, n: Name): string {
  if (k < 2) return n.text;
  return n.compound ? MULT_COMPLEX[k] + enclose(n) : MULT[k] + (/^(tert|sec)-/.test(n.text) ? "-" : "") + n.text;
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
  // No hyphen before a bracket: phenyl(pyrrolidin-1-yl)methanone. Without locants, each prefix after the first is in
  // brackets (P-16.5.1): trichloro(fluoro)methane, (carbamoylamino)(oxo)acetic acid.
  const bare = (t: string) => !/^N/.test(t); // no N-locant
  return parts.map((t, k) => (!k || /^[([{]/.test(t) ? t : noLocants && bare(t) && bare(parts[k - 1]) ? `(${t})` : `-${t}`)).join("");
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
    aminium: ["aminium", "aminium"], imine: ["imine", "imine"], carbonic: ["", ""], carbonylhalide: ["", ""],
    amidine: ["imidamide", "carboximidamide"], guanidine: ["", ""], hydrazide: ["hydrazide", "carbohydrazide"],
    imidic: ["imidic acid", "carboximidic acid"], imidate: ["imidate", "carboximidate"], imidoylhalide: ["imidoyl", "carboximidoyl"],
    peroxy: ["peroxoic acid", "carboperoxoic acid"], peroxyester: ["peroxoate", "carboperoxoate"], peroxide: ["", ""],
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
function saltName(g: Graph, parts: number[][]): string | undefined {
  const charge = (p: number[]) => p.reduce((t, i) => t + g.atoms[i].charge, 0);
  const cations = parts.filter((p) => charge(p) > 0), anions = parts.filter((p) => charge(p) < 0);
  if (!cations.length || !anions.length || cations.length + anions.length !== parts.length || parts.reduce((t, p) => t + charge(p), 0) !== 0) return undefined;
  const cationNames = cations.map((p) => cationName(g, p)), anionNames = anions.map((p) => anionName(g, p));
  const same = (names: (string | undefined)[]) => !!names[0] && names.every((n) => n === names[0]);
  if (!same(cationNames) || !same(anionNames)) return undefined;
  const times = (k: number, name: string) => (k < 2 ? name : /[\d([]/.test(name) ? `${MULT_COMPLEX[k]}(${name})` : MULT[k] + name);
  return `${times(cations.length, cationNames[0]!)} ${times(anions.length, anionNames[0]!)}`;
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
  if (part.length === 1 && a.el === "N" && a.h === 4 && a.charge === 1) return "ammonium";
  return new Namer(partOf(g, part)).name();
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
  const inorganic = ANIONS[ionFormula(g, part)];
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

export function iupacName(g: Graph): string | undefined {
  return iupacNameWhy(g).name;
}

// The name, or why Octet cannot name the structure yet (the namer's reason, for its tests and the gap survey).
export function iupacNameWhy(g: Graph): { name?: string; why?: string } {
  try {
    if (!g.atoms.length) return { why: "empty" };
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
    const name = parts.length === 1 ? new Namer(g).name() : saltName(g, parts);
    return name ? { name } : { why: parts.length === 1 ? "no name" : "salt" };
  } catch (e) {
    return { why: e instanceof Error ? e.message : String(e) };
  }
}
