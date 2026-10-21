// Octet's IUPAC namer, part 2: groups built on N, O, S, P and the halogens (IUPAC 2013, P-6). Clean room, from the
// published rules. namer.ts calls these functions at a few fixed points (perception, suffixes, prefixes and the
// whole-molecule name); each takes the namer itself. Every name is still read back by OPSIN before the app shows it.
import { assemblePrefixes, alphaKey, enclose, substituted, HALO, MULT, MULT_COMPLEX, SENIORITY, type Name, type Namer } from "./namer.ts";

// ——— Variants of principal groups: thio analogues and peroxy groups ———
// =S and -S- in place of =O and -O- (P-65.1.5, P-65.6.3.2.3, P-66.1.4.1, P-64.6), and -OO- in place of -O- (P-65.1.4,
// P-63.4.2.1). The variant of a group atom: "S" (=O and -S-: thioic S-acid), "O" (=S and -O-: thioic O-acid), "SS"
// (dithioic acid), "=S" (=S on its own: thioamide, thial, thione), "OO" (peroxoic acid, peroxoate, peroxol), or "".
export function groupVariant(n: Namer, c: number): string {
  if (n.el[c] === "S") return oxo(n, c).length === 1 && n.group[c] ? "S=O" : ""; // sulfinic acid, sulfinamide
  if (n.el[c] === "O") return n.group[c] === "alcohol" && n.adj[c].some((j) => n.el[j] === "O") ? "OO" : "";
  const d = n.carbonylO[c];
  if (d < 0) return "";
  const x = n.esterO.get(c) ?? n.adj[c].find((j) => j !== d && n.group[j] === "acid" && n.el[j] !== "C");
  if (x !== undefined && n.el[x] === "O" && n.adj[x].some((j) => j !== c && n.el[j] === "O")) return n.el[d] === "O" ? "OO" : "?";
  const dbl = n.el[d] === "S", single = x !== undefined && n.el[x] === "S";
  return dbl && single ? "SS" : dbl && x !== undefined ? "O" : single ? "S" : dbl ? "=S" : "";
}
// Whether the group carbon's double bond is to S (C=S).
export const thioDouble = (n: Namer, c: number) => n.carbonylO[c] >= 0 && n.el[n.carbonylO[c]] === "S";
const VARIANT_SUFFIX: Record<string, Record<string, [string, string]>> = {
  acid: { S: ["thioic S-acid", "carbothioic S-acid"], O: ["thioic O-acid", "carbothioic O-acid"], SS: ["dithioic acid", "carbodithioic acid"], OO: ["peroxoic acid", "carboperoxoic acid"] },
  ester: { S: ["thioate", "carbothioate"], O: ["thioate", "carbothioate"], SS: ["dithioate", "carbodithioate"], OO: ["peroxoate", "carboperoxoate"] },
  amide: { "=S": ["thioamide", "carbothioamide"] }, aldehyde: { "=S": ["thial", "carbothialdehyde"] },
  ketone: { "=S": ["thione", "thione"] }, halide: { "=S": ["thioyl", "carbothioyl"] }, alcohol: { OO: ["peroxol", "peroxol"] },
  sulfonic: { "S=O": ["sulfinic acid", "sulfinic acid"] }, sulfonate: { "S=O": ["sulfinate", "sulfinate"] },
  sulfonamide: { "S=O": ["sulfinamide", "sulfinamide"] }, sulfonylhalide: { "S=O": ["sulfinyl", "sulfinyl"] },
};
// The suffix for a parent's principal groups when they are variants: ethanethioamide, propane-2-thione, benzenecarbothioic
// S-acid, 3-chlorobenzene-1-carboperoxoic acid, 2-methylpropane-2-peroxol. Plain groups are senior to their variants
// (P-41, P-43): when a parent has both, the variants leave the suffix (sites) and are cited as prefixes
// (sulfanylidene, carbamothioyl, hydroperoxy).
export function variantSuffix(n: Namer, kind: string | undefined, sites: { atom: number; group: number }[], used: Set<number>, ring: boolean): string | undefined {
  if (!kind || !sites.length) return undefined;
  const v = sites.map((s) => groupVariant(n, s.group));
  if (v.every((x) => !x)) return undefined;
  if (v.some((x) => !x)) {
    for (const s of sites.filter((_, k) => v[k])) { used.delete(s.group); used.delete(n.carbonylO[s.group]); }
    const keep = sites.filter((_, k) => !v[k]);
    sites.length = 0;
    sites.push(...keep);
    return undefined;
  }
  const t = VARIANT_SUFFIX[kind]?.[v[0]];
  if (!t || v.some((x) => x !== v[0]) || (sites.length > 1 && (kind === "acid" || kind === "ester"))) throw new Error("thio");
  return t[ring ? 1 : 0];
}
// An acyl prefix with =S: ethanethioyl, benzenecarbothioyl, cyclohexanecarbothioyl, methanethioyl (P-65.1.7.3.2).
export function thioAcyl(n: Namer, c: number, name: Name): Name {
  if (!thioDouble(n, c)) return name;
  const t = name.text;
  const text = /formyl$/.test(t) ? t.replace(/formyl$/, "methanethioyl") : /acetyl$/.test(t) ? t.replace(/acetyl$/, "ethanethioyl")
    : /benzoyl$/.test(t) ? t.replace(/benzoyl$/, t === "benzoyl" ? "benzenecarbothioyl" : "benzene-1-carbothioyl") : /carbonyl$/.test(t) ? t.replace(/carbonyl$/, "carbothioyl")
    : /oyl$/.test(t) ? t.replace(/oyl$/, "ethioyl") : undefined;
  if (!text) throw new Error("thio");
  return { text, compound: name.compound || text !== t };
}
// A variant acid, ester or amide group cited as a prefix: sulfanylcarbonyl, hydroxycarbonothioyl, carbamothioyl,
// methoxycarbonothioyl, (methylsulfanyl)carbonyl, hydroperoxycarbonyl (P-65.1.7.3, P-65.6.3.2.3, P-66.1.4.1.3).
// Undefined for the rest.
export function thioPrefix(n: Namer, x: number, kind: string | undefined): Name | undefined {
  const v = groupVariant(n, x);
  if (!v) return undefined;
  if (kind === "acid") return { text: v === "OO" ? "hydroperoxycarbonyl" : v === "S" ? "sulfanylcarbonyl" : v === "O" ? "hydroxycarbonothioyl" : "sulfanylcarbonothioyl", compound: true };
  if (kind === "aldehyde") return { text: "methanethioyl", compound: false };
  if (kind === "amide") {
    const nAtom = n.groupHetero(x)[0], subs = n.adj[nAtom].filter((j) => j !== x).map((j) => n.substituent(j, nAtom));
    if (!subs.length) return { text: "carbamothioyl", compound: false };
    const inner = subs.length === 2 && subs[0].text === subs[1].text ? `di${enclose(subs[0])}` : subs.map(enclose).join("");
    return { text: `${inner}carbamothioyl`, compound: true };
  }
  if (kind === "ester") {
    const alkoxy = n.substituent(n.esterO.get(x)!, x), carbonyl = n.el[n.carbonylO[x]] === "S" ? "carbonothioyl" : "carbonyl";
    return { text: `${enclose(alkoxy)}${carbonyl}`.replace(/^\(([a-z-]+oxy)\)(carbon[a-z]+)$/, "$1$2"), compound: true };
  }
  if (kind === "halide" || kind === "anhydride") throw new Error("thio");
  return undefined;
}

// Peroxy acids, esters and anhydrides (P-65.1.4.2, P-65.6.3.2.4, P-65.7.5): C(=O)-O-O-H, C(=O)-O-O-R and
// C(=O)-O-O-C(=O), for the carbonyl carbon c and its single-bonded O, x. Marks them; false for other groups.
export function peroxyCarbonyl(n: Namer, c: number, x: number, cs: number[]): boolean {
  if (n.el[x] !== "O" || n.adj[x].length !== 2 || n.el[n.carbonylO[c]] !== "O") return false;
  const y = n.adj[x].find((j) => j !== c)!;
  if (n.el[y] !== "O" || n.inRing[y] || n.q[y] || !single(n, y) || n.adj[y].length + n.h[y] !== 2) return false;
  const z = n.adj[y].find((j) => j !== x);
  if (z === undefined) { n.mark(c, "acid", cs); n.group[x] = "acid"; }
  else if (plainC(n, z)) { n.mark(c, "ester", cs); n.esterO.set(c, x); n.group[x] = "ester"; }
  else if (n.el[z] === "C" && n.carbonylO[z] >= 0 && !n.inRing[z] && n.el[n.carbonylO[z]] === "O") { n.mark(c, "anhydride", cs); n.group[x] = "anhydride"; n.anhydrideO.set(c, x); }
  else return false;
  n.het.set(y, "OO");
  return true;
}

// ——— Perception of hetero-hetero links ———
// Roles (n.het): "SS" polysulfide S (P-63.4.2.2), "OO" peroxide O, "NN" hydrazine N (P-68.3.1.2), "N=N" diazene N
// (P-68.3.1.3), "hz" hydrazone N (C=N-N), "NO" hydroxylamine N and O (P-68.3.1.1), "ON" an O on an amide or ring
// N, "N=O" nitroso N and O (P-61.5.1), "NX" a halogen on N.
const plainC = (n: Namer, j: number) => n.el[j] === "C" && n.carbonylO[j] < 0 && !n.isNitrileC(j);
const single = (n: Namer, i: number) => n.adj[i].every((j) => n.ord(i, j) === 1);
const free = (n: Namer, i: number) => !n.inRing[i] && !n.q[i] && !n.group[i] && !n.het.has(i) && !n.cip[i];
// An O on an N (amide, ring or hydroxylamine N): OH, or O bonded to a plain carbon.
const oxyOnN = (n: Namer, o: number, on: number) => n.el[o] === "O" && free(n, o) && single(n, o) && n.adj[o].length + n.h[o] === 2 && n.adj[o].every((j) => j === on || plainC(n, j));

// A neighbour j of an amide N (not the carbonyl carbon) that is not a carbon: N-hydroxy, N-methoxy (Weinreb amides,
// hydroxamic acids), N-halo. Claims it.
export function amideHetero(n: Namer, x: number, j: number): boolean {
  if (HALO[n.el[j]] && n.adj[j].length === 1) { n.het.set(j, "NX"); return true; }
  if (oxyOnN(n, j, x)) { n.het.set(j, "ON"); return true; }
  return false;
}

export function perceiveHetero(n: Namer) {
  const { el, adj, h } = n;
  perceiveSulfur(n);
  perceiveCentres(n);
  for (let i = 0; i < n.n; i++) {
    // Halogens on N (N-bromo, N-chloro); the N is an amine, amide or ring N.
    if (HALO[el[i]] && adj[i].length === 1 && el[adj[i][0]] === "N" && !n.q[i] && n.ord(i, adj[i][0]) === 1) { n.het.set(i, "NX"); continue; }
    if (!free(n, i)) continue;
    if (el[i] === "S" && single(n, i) && adj[i].length + h[i] === 2 && adj[i].some((j) => el[j] === "S")) {
      // Polysulfanes: each S of the chain has two bonds, to S, a plain carbon or H.
      const chain = sulfurChain(n, i);
      if (chain && chain.length <= 6) for (const s of chain) n.het.set(s, "SS");
      continue;
    }
    if (el[i] === "O" && single(n, i) && adj[i].length + h[i] === 2) {
      const o = adj[i].find((j) => el[j] === "O");
      if (o === undefined || !free(n, o) || !single(n, o) || adj[o].length + h[o] !== 2) continue;
      const ends = [...adj[i], ...adj[o]].filter((j) => j !== i && j !== o);
      if (!ends.every((j) => plainC(n, j))) continue;
      n.het.set(i, "OO"); n.het.set(o, "OO");
      // A hydroperoxide (R-OOH) is a principal group like an alcohol, named by the suffix peroxol.
      const [inner, cs] = h[o] === 1 ? [i, adj[i].filter((j) => j !== o)] : h[i] === 1 ? [o, adj[o].filter((j) => j !== i)] : [-1, []];
      if (inner >= 0) n.mark(inner, "alcohol", cs);
      continue;
    }
    if (el[i] !== "N") continue;
    const ns = adj[i].filter((j) => el[j] === "N"), os = adj[i].filter((j) => el[j] === "O");
    // Nitroso (R-N=O, R2N-N=O): only a prefix.
    const oxo = os.find((o) => n.ord(i, o) === 2 && adj[o].length === 1 && !n.q[o]);
    if (oxo !== undefined) {
      const r = adj[i].filter((j) => j !== oxo);
      if (r.length === 1 && !h[i] && n.ord(i, r[0]) === 1 && (plainC(n, r[0]) || el[r[0]] === "N")) { n.het.set(i, "N=O"); n.het.set(oxo, "N=O"); }
      continue;
    }
    // Diazenes (R-N=N-R'), hydrazones (C=N-N) and hydrazines (N-N), with only plain carbons and H otherwise.
    if (ns.length === 1 && !os.length) {
      const m = ns[0];
      if (!free(n, m) || n.ord(i, m) === 3) continue;
      const others = [...adj[i], ...adj[m]].filter((j) => j !== i && j !== m);
      if (n.ord(i, m) === 2) {
        if (adj[i].length + h[i] === 2 && adj[m].length + h[m] === 2 && others.every((j) => plainC(n, j) && n.ord(i, j) + n.ord(m, j) === 1)) { n.het.set(i, "N=N"); n.het.set(m, "N=N"); }
        continue;
      }
      // i = the N bonded by a double bond to C (hydrazone), m = the other.
      const c = adj[i].find((j) => n.ord(i, j) === 2);
      if (c !== undefined) {
        if (el[c] === "C" && n.carbonylO[c] < 0 && !n.isNitrileC(c) && adj[i].length === 2 && !h[i] && single(n, m) && adj[m].length + h[m] === 3 && adj[m].every((j) => j === i || plainC(n, j))) { n.het.set(i, "hz"); n.het.set(m, "hz"); }
        continue;
      }
      if (n.adj[m].some((j) => n.ord(m, j) === 2)) continue; // the hydrazone's other N, from its own side
      if (single(n, i) && single(n, m) && adj[i].length + h[i] === 3 && adj[m].length + h[m] === 3 && others.every((j) => plainC(n, j))) { n.het.set(i, "NN"); n.het.set(m, "NN"); }
      continue;
    }
    // Hydroxylamines: an N with one O (OH or O-C), and otherwise plain carbons and H.
    if (os.length === 1 && !ns.length && single(n, i) && adj[i].length + h[i] === 3 && oxyOnN(n, os[0], i) && adj[i].every((j) => j === os[0] || plainC(n, j))) {
      n.het.set(i, "NO"); n.het.set(os[0], "NO");
    }
  }
  // Ring N bearing OH or OR: N-hydroxy (piperidin-1-ol, 1-hydroxypyrrolidine-2,5-dione), N-alkoxy.
  for (let i = 0; i < n.n; i++) {
    if (el[i] !== "N" || !n.inRing[i] || n.q[i]) continue;
    for (const o of adj[i]) if (!n.inRing[o] && oxyOnN(n, o, i)) { n.het.set(o, "ON"); if (h[o] === 1) n.mark(o, "alcohol", [i]); }
  }
}
// The S atoms of a polysulfane chain through s, if every S has two bonds (to S, a plain carbon or H).
function sulfurChain(n: Namer, s: number): number[] | undefined {
  const chain = [s], stack = [s];
  while (stack.length) {
    const i = stack.pop()!;
    for (const j of n.adj[i]) {
      if (n.el[j] !== "S" || chain.includes(j)) continue;
      if (!free(n, j) || !single(n, j) || n.adj[j].length + n.h[j] !== 2) return undefined;
      chain.push(j); stack.push(j);
    }
  }
  const ends = chain.flatMap((i) => n.adj[i].filter((j) => n.el[j] !== "S"));
  return ends.every((j) => plainC(n, j)) ? chain : undefined;
}
// An amine N with hetero neighbours: N-halo, N-nitroso, and amines on a ring N (4-methyl-N,N-diphenylpiperidin-1-amine,
// a hydrazine with one N in a ring). Marks it as an amine borne by its carbons and ring N.
export function heteroAmine(n: Namer, i: number): boolean {
  if (n.q[i] || !single(n, i)) return false;
  const on = n.adj[i].filter((j) => plainC(n, j) || (n.el[j] === "N" && n.inRing[j] && !n.q[j]));
  const rest = n.adj[i].filter((j) => !on.includes(j));
  if (!on.length || (!rest.length && on.every((j) => n.el[j] === "C")) || !rest.every((j) => n.het.get(j) === "NX" || n.het.get(j) === "N=O")) return false;
  n.mark(i, "amine", on);
  return true;
}
// Bonds between heteroatoms that perception accounted for.
export function heteroBond(n: Namer, a: number, b: number): boolean {
  if (n.het.has(a) || n.het.has(b)) return true;
  return (n.group[a] === "amine" && !!n.bearer.get(a)?.includes(b)) || (n.group[b] === "amine" && !!n.bearer.get(b)?.includes(a));
}

// ——— Oxoacid centres of sulfur (P-65.3, P-66.1.1.4, P-67.1) ———
// The terminal =O atoms of an S or P.
const oxo = (n: Namer, x: number) => n.adj[x].filter((j) => n.el[j] === "O" && n.ord(x, j) === 2 && n.adj[j].length === 1 && !n.q[j]);
// A ligand of an S or P oxoacid centre x (single bond): OH, OR (ester), N (amide; NR on a ring is "Nring"), X
// (halide), or "bridge" (an O to another S centre: an anhydride). Undefined for anything else.
function ligand(n: Namer, x: number, j: number): string | undefined {
  if (n.ord(x, j) !== 1 || n.q[j]) return undefined;
  if (HALO[n.el[j]]) return n.adj[j].length === 1 ? "X" : undefined;
  if (n.el[j] === "O" && !n.inRing[j]) {
    if (n.adj[j].length === 1) return n.h[j] === 1 ? "OH" : undefined;
    const k = n.adj[j].find((y) => y !== x)!;
    if (n.adj[j].length === 2 && plainC(n, k)) return "OR";
    if (n.adj[j].length === 2 && ((n.el[k] === "S" && oxo(n, k).length === 2) || n.el[k] === "P") && !n.inRing[k] && !n.q[k]) return "bridge";
    return undefined;
  }
  if (n.el[j] !== "N") return undefined;
  if (n.inRing[j]) return "Nring";
  return single(n, j) && n.adj[j].length + n.h[j] === 3 && n.adj[j].every((y) => y === x || plainC(n, y) || (n.el[y] === "S" && !n.inRing[y] && oxo(n, y).length === 2)) ? "N" : undefined;
}
// S with =O and two other single bonds that namer.ts does not perceive: sulfinic acids, sulfonate and sulfinate esters,
// sulfonamides and sulfinamides, sulfinyl halides, sulfonic anhydrides, sulfonyl groups on a ring N (on a carbon:
// 1-(methanesulfonyl)piperidine; without one, the ring N bears the suffix: piperidine-1-sulfonic acid), and without
// carbon, sulfuric and sulfurous acid derivatives (dimethyl sulfate, sulfamic acid). Role "S" in n.het.
function perceiveSulfur(n: Namer) {
  for (let s = 0; s < n.n; s++) {
    if (n.el[s] !== "S" || n.inRing[s] || n.q[s] || n.h[s]) continue;
    const os = oxo(n, s), rest = n.adj[s].filter((j) => !os.includes(j));
    if (!os.length || os.length > 2 || rest.length !== 2) continue;
    const cs = rest.filter((j) => n.el[j] === "C"), lig = rest.filter((j) => n.el[j] !== "C"), types = lig.map((j) => ligand(n, s, j));
    if (cs.length === 2 || cs.some((j) => !plainC(n, j)) || types.some((t) => !t) || (n.cip[s] && !(os.length === 1 && cs.length))) continue;
    if (cs.length === 1 && os.length === 2 && (types[0] === "OH" || types[0] === "X")) continue; // sulfonic acids, sulfonyl halides: namer.ts
    // The atom the group hangs on: its carbon, or a ring N that takes the suffix.
    const ring = lig.filter((_, k) => types[k] === "Nring");
    const on = cs.length ? cs : ring.length === 1 && types.length === 2 ? ring : [];
    const t = on.length && !cs.length ? types[1 - types.indexOf("Nring")] : on.length ? types[0] : undefined;
    n.het.set(s, "S");
    n.sulfur.add(s);
    for (const o of os) n.sulfur.add(o);
    lig.forEach((j, k) => {
      if (types[k] === "OH" || types[k] === "X") n.sulfur.add(j);
      else if (types[k] === "OR" || types[k] === "N" || types[k] === "bridge") n.het.set(j, `S${types[k]}`);
    });
    if (!on.length || (t === "Nring" && cs.length)) continue; // sulfuric acid derivatives; a sulfonyl on a ring N
    const kind = t === "OH" ? "sulfonic" : t === "X" ? "sulfonylhalide" : t === "OR" ? "sulfonate" : t === "N" ? "sulfonamide" : t === "bridge" ? "anhydride" : undefined;
    if (kind) n.mark(s, kind as never, on);
  }
}
// The N of a sulfonamide group (for its N-substituents as N-prefixes).
export function sulfonamideN(n: Namer, kind: string | undefined, s: number): number | undefined {
  return kind === "sulfonamide" ? n.adj[s].find((j) => n.het.get(j) === "SN") : undefined;
}
// A sulfonate or sulfinate ester (P-65.6.3.3): the alkyl from the ester O, then the acid's name: methyl
// methanesulfonate, 4-[(methanesulfonyl)oxy]butyl methanesulfonate (busulfan).
export function sulfonateName(n: Namer): string | undefined {
  const s = [...n.bearer.keys()].find((g) => n.group[g] === "sulfonate")!;
  const o = n.adj[s].find((j) => n.het.get(j) === "SOR")!, r = n.adj[o].find((j) => j !== s)!;
  const acid = n.parentName("sulfonate" as never, new Set(), n.side(s, o));
  return acid && `${n.substituent(r, o).text} ${acid.text}`;
}
// A sulfur oxoacid centre cited as a prefix, from the atom `from`: methanesulfonyl, 4-methylbenzene-1-sulfonyl,
// sulfo, sulfino, methoxysulfonyl, sulfamoyl, dimethylsulfamoyl, chlorosulfonyl, [(R)-methanesulfinyl] (P-65.3.2.3,
// P-66.1.1.4.3). Undefined for the S groups namer.ts names.
function sulfurPrefix(n: Namer, x: number, from: number): Name | undefined {
  if (!n.het.has(x) && n.group[x] !== "sulfonylhalide" && !n.cip[x]) return undefined;
  const os = oxo(n, x), others = n.adj[x].filter((j) => j !== from && !os.includes(j)), word = os.length === 2 ? "sulfonyl" : "sulfinyl";
  const stereo = (t: Name): Name => (n.cip[x] === "R" || n.cip[x] === "S" ? { text: `(${n.cip[x]})-${t.text}`, compound: true } : t);
  if (others.length !== 1) throw new Error("sulfur");
  const j = others[0];
  if (n.el[j] === "C") {
    const p = n.inRing[j] ? { atoms: n.rings[n.ringOf[j]], ring: true } : { atoms: n.bestChain(j, x), ring: false };
    return stereo({ text: n.nameParent(p, { attach: [j, x], sulfo: word }).text, compound: true });
  }
  const t = ligand(n, x, j);
  if (t === "OH") return { text: os.length === 2 ? "sulfo" : "sulfino", compound: false };
  if (t === "X") return { text: `${HALO[n.el[j]]}${word}`, compound: true };
  if (t === "OR") return { text: `${enclose(n.substituent(j, x))}${word}`.replace(/^\(([a-z-]+oxy)\)(sulf[a-z]+)$/, "$1$2"), compound: true };
  if (t === "N") {
    const subs = n.adj[j].filter((y) => y !== x).map((y) => n.substituent(y, j)), amoyl = os.length === 2 ? "sulfamoyl" : "sulfinamoyl";
    return { text: `${substituted(subs)}${amoyl}`, compound: subs.length > 0 };
  }
  if (t === "Nring") return { text: `${enclose(n.substituent(j, x))}${word}`, compound: true };
  throw new Error("sulfur");
}

// ——— Oxoacid centres of phosphorus and nitrogen, and phosphonium (P-67.1, P-65.6.3, P-73.1) ———
// P with an O, N or halogen ligand (phosphates, phosphonates, phosphinates, phosphites, their amides and halides; P
// bonded only to C and H is a phosphane, in namer.ts), nitrate and nitrite esters, and phosphanium cations. Roles in
// n.het: "P" (and "P-" for its ligands), "NO3" and "NO2" (the N, its O atoms and the ester O), "P+".
function perceiveCentres(n: Namer) {
  for (let p = 0; p < n.n; p++) {
    if (n.inRing[p] || n.cip[p] || n.het.has(p)) continue;
    if (n.el[p] === "P" && n.q[p] === 1 && n.adj[p].length + n.h[p] === 4 && n.adj[p].every((j) => plainC(n, j) && n.ord(p, j) === 1)) { n.het.set(p, "P+"); continue; }
    if (n.el[p] === "N") { nitrate(n, p); continue; }
    if (n.el[p] !== "P" || n.q[p]) continue;
    const os = oxo(n, p), rest = n.adj[p].filter((j) => !os.includes(j));
    if (os.length > 1 || rest.some((j) => n.ord(p, j) !== 1) || os.length + rest.length + n.h[p] !== (os.length ? 4 : 3)) continue;
    const lig = rest.filter((j) => n.el[j] !== "C"), types = lig.map((j) => ligand(n, p, j));
    if (!lig.length || rest.some((j) => n.el[j] === "C" && !plainC(n, j)) || types.some((t) => !t)) continue;
    n.het.set(p, "P");
    for (const o of os) n.het.set(o, "P-");
    lig.forEach((j, k) => { if (types[k] !== "Nring" && !n.het.has(j)) n.het.set(j, "P-"); });
  }
}
// A nitrate ester (R-O-NO2, as N+(=O)O-) or nitrite ester (R-O-N=O) with its N at x.
function nitrate(n: Namer, x: number) {
  const os = n.adj[x].filter((j) => n.el[j] === "O" && !n.inRing[j]);
  if (os.length !== n.adj[x].length || n.h[x]) return;
  const dbl = os.filter((o) => n.ord(x, o) === 2 && n.adj[o].length === 1 && !n.q[o]), minus = os.filter((o) => n.ord(x, o) === 1 && n.adj[o].length === 1 && n.q[o] === -1);
  const ester = os.filter((o) => n.ord(x, o) === 1 && !n.q[o] && n.adj[o].length === 2 && plainC(n, n.adj[o].find((j) => j !== x)!));
  const role = n.q[x] === 1 && os.length === 3 && dbl.length === 1 && minus.length === 1 && ester.length === 1 ? "NO3" : !n.q[x] && os.length === 2 && dbl.length === 1 && ester.length === 1 ? "NO2" : undefined;
  if (!role || ester.some((o) => n.het.has(o) || n.group[o])) return;
  for (const a of [x, ...os]) n.het.set(a, role);
}
// Charged atoms Octet names here: phosphanium P+, and the N+ and O- of a nitrate ester.
export function heteroCharged(n: Namer, i: number): boolean {
  const { el, q, adj } = n;
  if (el[i] === "P" && q[i] === 1) return !n.inRing[i] && adj[i].length + n.h[i] === 4 && adj[i].every((j) => el[j] === "C" && n.ord(i, j) === 1);
  const x = el[i] === "N" ? i : el[i] === "O" && q[i] === -1 && adj[i].length === 1 ? adj[i][0] : -1;
  if (x < 0 || el[x] !== "N" || q[x] !== 1 || n.inRing[x] || adj[x].length !== 3 || !adj[x].every((j) => el[j] === "O")) return false;
  const os = adj[x];
  return os.filter((o) => q[o] === -1 && adj[o].length === 1).length === 1 && os.filter((o) => n.ord(x, o) === 2 && !q[o]).length === 1
    && os.some((o) => !q[o] && n.ord(x, o) === 1 && adj[o].length === 2);
}
type Centre = { at: number; os: number[]; cs: number[]; lig: number[]; types: string[] };
const centreOf = (n: Namer, x: number): Centre => {
  const os = oxo(n, x), rest = n.adj[x].filter((j) => !os.includes(j)), lig = rest.filter((j) => n.el[j] !== "C");
  return { at: x, os, cs: rest.filter((j) => n.el[j] === "C"), lig, types: lig.map((j) => ligand(n, x, j) ?? "?") };
};
// The class a centre ranks by (P-41): a cation, an acid (an OH left), an ester, an acid halide or an amide; undefined
// when it cannot be the parent (anhydrides, ring N).
function centreClass(n: Namer, x: number): string | undefined {
  const role = n.het.get(x);
  if (role === "P+") return "cation";
  if (role === "NO3" || role === "NO2") return "ester";
  const c = centreOf(n, x);
  if (c.types.some((t) => t === "bridge" || t === "Nring" || t === "?")) return undefined;
  return c.types.includes("OH") ? "acid" : c.types.includes("OR") ? "ester" : c.types.includes("X") ? "halide" : c.types.includes("N") ? "amide" : undefined;
}
// The last kind of characteristic group (SENIORITY) each class of centre is junior to.
const OUTRANKED_BY: Record<string, string> = { acid: "sulfonic", ester: "carbamate", halide: "sulfonylhalide", amide: "urea" };
// Alkyl groups of a functional class name (P-65.6.3.2): methyl, dimethyl, ethyl methyl, bis(2-chloroethyl).
function alkyls(names: Name[]): string {
  const groups = new Map<string, { name: Name; k: number }>();
  for (const a of names) groups.set(a.text, { name: a, k: (groups.get(a.text)?.k ?? 0) + 1 });
  return [...groups.values()].sort((a, b) => alphaKey(a.name.text).localeCompare(alphaKey(b.name.text)))
    .map((g) => (g.k === 1 ? g.name.text : g.name.compound || /^\d/.test(g.name.text) ? `${MULT_COMPLEX[g.k]}(${g.name.text})` : MULT[g.k] + g.name.text)).join(" ");
}
const HALIDE_STEM: Record<string, string> = { F: "fluorid", Cl: "chlorid", Br: "bromid", I: "iodid" };
// The ester groups' names (from each OR ligand) and the hydrogen of the OH left: "dimethyl", "methyl dihydrogen".
function esterPart(n: Namer, c: Centre): string {
  const ors = c.lig.filter((_, k) => c.types[k] === "OR"), oh = c.types.filter((t) => t === "OH").length;
  const names = ors.map((o) => n.substituent(n.adj[o].find((j) => j !== c.at)!, o));
  return `${alkyls(names)} ${oh ? `${MULT[oh]}hydrogen ` : ""}`;
}
// The one halogen of a centre's halide ligands, or throws for mixed halides.
function halideOf(n: Namer, c: Centre): string {
  const els = new Set(c.lig.filter((_, k) => c.types[k] === "X").map((j) => n.el[j]));
  if (els.size !== 1) throw new Error("mixed halides");
  return [...els][0];
}
// N-substituents of amide ligands, with locants N, N', N'' (the N with more substituents first).
function amideSubs(n: Namer, c: Centre): { loc: string; name: Name }[] {
  const ns = c.lig.filter((_, k) => c.types[k] === "N").map((j) => ({ j, subs: n.adj[j].filter((y) => y !== c.at).map((y) => n.substituent(y, j)) }));
  ns.sort((a, b) => b.subs.length - a.subs.length || a.subs.map((x) => x.text).join().localeCompare(b.subs.map((x) => x.text).join()));
  return ns.flatMap((a, k) => a.subs.map((name) => ({ loc: `N${"'".repeat(k)}`, name })));
}
// A phosphorus oxoacid centre as the parent (P-67.1): methylphosphonic acid, trimethyl phosphate, methyl dihydrogen
// phosphate, diethyl (2-oxopropyl)phosphonate, phosphoryl trichloride, diethyl phosphorochloridate,
// N,N,N',N',N'',N''-hexamethylphosphoric triamide, diethyl N-phenylphosphoramidate, trimethyl phosphite.
function phosphorusName(n: Namer, c: Centre): string {
  const nR = c.cs.length + n.h[c.at], five = c.os.length === 1, rs = c.cs.map((j) => n.substituent(j, c.at));
  if (nR > 2) throw new Error("phosphorus");
  const base = ["phosphor", "phosphon", "phosphin"][nR], count = (t: string) => c.types.filter((x) => x === t).length;
  const o = count("OH") + count("OR"), x = count("X"), nn = count("N");
  if (x && !o && !nn) {
    const hal = halideOf(n, c), word = { F: "fluoride", Cl: "chloride", Br: "bromide", I: "iodide" }[hal]!;
    if (!five) return `${substituted([...c.lig.map((j) => ({ text: HALO[n.el[j]], compound: false })), ...rs])}phosphane`; // trichlorophosphane
    return nR ? `${substituted(rs)}${base}ic ${MULT[x]}${word}` : `phosphoryl ${MULT[x]}${word}`;
  }
  if (nn && !x) {
    const list = [...rs.map((name) => ({ loc: "P", name })), ...amideSubs(n, c)];
    if (!o) return `${letterPrefixes(list)}${base}${five ? "ic" : "ous"} ${MULT[nn]}amide`;
    if (!five || nR > 1) throw new Error("phosphorus");
    const stem = `${base}${nR ? "" : "o"}${nn > 1 ? `${MULT[nn]}amid` : "amid"}`.replace(/^phosphoroamid/, "phosphoramid");
    return count("OR") ? `${esterPart(n, c)}${letterPrefixes(list)}${stem}ate` : `${letterPrefixes(list)}${stem}ic acid`;
  }
  if (nn) throw new Error("phosphorus");
  const r = substituted(rs);
  if (x) {
    if (!five) throw new Error("phosphorus");
    const stem = `${base}o${x > 1 ? MULT[x] : ""}${HALIDE_STEM[halideOf(n, c)]}`;
    return count("OR") ? `${esterPart(n, c)}${r}${stem}ate` : `${r}${stem}ic acid`;
  }
  return count("OR") ? `${esterPart(n, c)}${r}${base.replace(/or$/, "")}${five ? "ate" : "ite"}` : `${r}${base}${five ? "ic" : "ous"} acid`;
}
// A sulfuric or sulfurous acid derivative with no carbon on S as the parent (P-67.1.2): dimethyl sulfate, ethyl
// hydrogen sulfate, phenylsulfamic acid, methyl sulfamate, N,N'-dimethylsulfuric diamide, dimethylsulfamoyl chloride,
// methyl sulfurochloridate, dimethyl sulfite, sulfurous dichloride.
function sulfuricName(n: Namer, c: Centre): string {
  const six = c.os.length === 2, count = (t: string) => c.types.filter((x) => x === t).length;
  const o = count("OH") + count("OR"), x = count("X"), nn = count("N");
  const word = (hal: string) => ({ F: "fluoride", Cl: "chloride", Br: "bromide", I: "iodide" })[hal]!;
  if (x === 2) return `${six ? "sulfuryl" : "sulfurous"} di${word(halideOf(n, c))}`;
  if (!six) {
    if (o === 2) return count("OR") ? `${esterPart(n, c)}sulfite`.replace(/ $/, "") : "sulfurous acid";
    if (nn === 2) return `${letterPrefixes(amideSubs(n, c))}sulfurous diamide`;
    throw new Error("sulfur");
  }
  if (nn === 2) return `${letterPrefixes(amideSubs(n, c))}sulfuric diamide`;
  if (nn === 1) {
    const subs = substituted(amideSubs(n, c).map((a) => a.name));
    if (x) return `${subs}sulfamoyl ${word(halideOf(n, c))}`;
    return count("OR") ? `${esterPart(n, c)}${subs}sulfamate` : `${subs}sulfamic acid`;
  }
  if (x) return count("OR") ? `${esterPart(n, c)}sulfuro${HALIDE_STEM[halideOf(n, c)]}ate` : `sulfuro${HALIDE_STEM[halideOf(n, c)]}ic acid`;
  return count("OR") ? `${esterPart(n, c)}sulfate`.replace(/ $/, "") : "sulfuric acid";
}
// A sulfonic anhydride (P-65.7.7): trifluoromethanesulfonic anhydride, 4-methylbenzenesulfonic methanesulfonic
// anhydride. Each acid is named with its S taken as a sulfonic acid.
function sulfonicAnhydrideName(n: Namer): string | undefined {
  const ss = [...n.bearer.keys()].filter((g) => n.group[g] === "anhydride");
  if (ss.length !== 2 || ss.some((g) => n.el[g] !== "S")) return undefined;
  const o = n.adj[ss[0]].find((j) => n.het.get(j) === "Sbridge" && n.adj[j].includes(ss[1]));
  if (o === undefined) throw new Error("anhydride");
  const acids = ss.map((g) => {
    n.group[g] = "sulfonic";
    try { return n.parentName("sulfonic", new Set(), n.side(g, o))?.text.replace(/ acid$/, ""); } finally { n.group[g] = "anhydride"; }
  });
  if (acids.some((a) => !a)) throw new Error("anhydride");
  return acids[0] === acids[1] ? `${acids[0]} anhydride` : `${acids.sort((a, b) => alphaKey(a!).localeCompare(alphaKey(b!))).join(" ")} anhydride`;
}
// A centre (S, P or N) that outranks the molecule's senior characteristic group, named as the parent; or a
// phosphanium cation (P-73.1): methyl(triphenyl)phosphanium.
function centreName(n: Namer, kind: string | undefined): string | undefined {
  const centres = [...n.het].filter(([x, r]) => (r === "S" && !n.group[x]) || r === "P" || r === "P+" || ((r === "NO3" || r === "NO2") && n.el[x] === "N")).map(([x]) => x);
  const order = ["cation", "acid", "ester", "halide", "amide"];
  const ranked = centres.map((x) => ({ x, cls: centreClass(n, x) })).filter((c) => c.cls).sort((a, b) => order.indexOf(a.cls!) - order.indexOf(b.cls!));
  const best = ranked[0];
  if (!best) return undefined;
  if (kind && best.cls !== "cation" && SENIORITY.indexOf(kind as never) <= SENIORITY.indexOf(OUTRANKED_BY[best.cls!] as never)) return undefined;
  if (kind === "aminium") return undefined;
  const x = best.x, role = n.het.get(x);
  if (role === "P+") return `${substituted(n.adj[x].map((j) => n.substituent(j, x)))}phosphanium`;
  if (role === "NO3" || role === "NO2") {
    const o = n.adj[x].find((j) => n.adj[j].length === 2)!;
    return `${n.substituent(n.adj[o].find((j) => j !== x)!, o).text} ${role === "NO3" ? "nitrate" : "nitrite"}`;
  }
  const c = centreOf(n, x);
  return n.el[x] === "P" ? phosphorusName(n, c) : sulfuricName(n, c);
}
// A phosphorus centre cited as a prefix: phosphono, (dimethoxyphosphoryl), [hydroxy(methyl)phosphoryl],
// (diethoxyphosphanyl) (P-67.1.4); a nitrate or nitrite N: nitro, nitroso (in nitrooxy, nitrosooxy).
function centrePrefix(n: Namer, x: number, from: number): Name | undefined {
  const role = n.het.get(x);
  if (role === "NO3" || role === "NO2") return n.el[x] === "N" ? { text: role === "NO3" ? "nitro" : "nitroso", compound: false } : undefined;
  if (role === "P+") throw new Error("phosphanium as a prefix");
  if (role !== "P") return undefined;
  if (n.h[x]) throw new Error("phosphorus");
  const os = oxo(n, x), subs = n.adj[x].filter((j) => j !== from && !os.includes(j)).map((j) => n.substituent(j, x));
  if (os.length && subs.length === 2 && subs.every((s) => s.text === "hydroxy")) return { text: "phosphono", compound: false };
  return { text: `${substituted(subs)}${os.length ? "phosphoryl" : "phosphanyl"}`, compound: true };
}

// ——— Prefixes ———
// Prefixes for hetero-hetero groups: disulfanyl, peroxy, hydrazinyl, hydrazinylidene, diazenyl, nitroso. Undefined for
// other atoms.
export function heteroPrefix(n: Namer, x: number, from: number): Name | undefined {
  const role = n.het.get(x), el = n.el[x];
  if (el === "S" && n.sulfur.has(x) && oxo(n, x).length) return sulfurPrefix(n, x, from);
  if (el === "P" || (el === "N" && role?.startsWith("NO"))) { const c = centrePrefix(n, x, from); if (c) return c; }
  // Peroxy (also an ester's or an acid's -O-O-): hydroperoxy, (methylperoxy), tert-butylperoxy.
  if (el === "O" && !n.inRing[x]) {
    const o = n.adj[x].find((j) => j !== from && n.el[j] === "O" && !n.inRing[j]);
    if (o === undefined) return undefined;
    const r = n.adj[o].find((j) => j !== x);
    if (r === undefined) return { text: "hydroperoxy", compound: false };
    const s = n.substituent(r, o);
    return { text: `${s.text === "tert-butyl" ? s.text : enclose(s)}peroxy`, compound: true };
  }
  if (!role) return undefined;
  if (role === "SS") {
    // -S-S-R: disulfanyl, methyldisulfanyl, (2-aminoethyl)disulfanyl; trisulfanyl for -S-S-S-.
    let k = 1, at = x, prev = from;
    for (;;) {
      const next = n.adj[at].find((j) => j !== prev && n.el[j] === "S");
      if (next === undefined) break;
      prev = at; at = next; k++;
    }
    const r = n.adj[at].find((j) => j !== prev);
    const word = `${MULT[k]}sulfanyl`;
    return r === undefined ? { text: word, compound: false } : { text: `${enclose(n.substituent(r, at))}${word}`, compound: true };
  }
  if (role === "N=O") return el === "N" ? { text: "nitroso", compound: false } : undefined;
  if (role === "N=N") {
    const m = n.adj[x].find((j) => n.het.get(j) === "N=N")!, r = n.adj[m].find((j) => j !== x);
    const ez = n.cipBond.get(n.key(x, m));
    const text = r === undefined ? "diazenyl" : `${enclose(n.substituent(r, m))}diazenyl`;
    return ez === "E" || ez === "Z" ? { text: `(${ez})-${text}`, compound: true } : { text, compound: r !== undefined };
  }
  if (role === "NN") return hydrazinyl(n, x, from, n.adj[x].find((j) => n.het.get(j) === "NN")!, "yl");
  if (role === "hz") {
    const m = n.adj[x].find((j) => n.het.get(j) === "hz")!;
    if (n.ord(x, from) === 2) return hydrazinyl(n, x, from, m, "ylidene"); // =N-NR2 on a parent carbon
    return hydrazinyl(n, x, from, m, "yl"); // -NR-N=CR2
  }
  return undefined;
}
// A hydrazine group with its free valence at x (locant 1) and its other N, m (locant 2): hydrazinyl,
// 2-phenylhydrazinyl, 1-methylhydrazinyl, 2-(propan-2-ylidene)hydrazinyl, (2-phenylhydrazinylidene).
function hydrazinyl(n: Namer, x: number, from: number, m: number, end: string): Name {
  const list = [
    ...n.adj[x].filter((j) => j !== from && j !== m).map((j) => ({ loc: "1", name: hydrazineSub(n, j, x) })),
    ...n.adj[m].filter((j) => j !== x).map((j) => ({ loc: "2", name: hydrazineSub(n, j, m) })),
  ];
  return { text: `${assemblePrefixes(list, false)}hydrazin${end}`, compound: list.length > 0 };
}
// A substituent on a hydrazine N: a carbon, or the ylidene of a hydrazone.
function hydrazineSub(n: Namer, j: number, on: number): Name {
  return n.ord(j, on) === 2 ? ylidene(n, j, on) : n.substituent(j, on);
}
// A carbon double-bonded to `from` as a substituent: propan-2-ylidene, cyclohexylidene, phenylmethylidene (P-29.2).
export function ylidene(n: Namer, c: number, from: number): Name {
  if (n.cipBond.get(n.key(c, from))) throw new Error("hydrazone stereo");
  const p = n.inRing[c] ? { atoms: n.rings[n.ringOf[c]], ring: true } : { atoms: n.bestChain(c, from), ring: false };
  const t = n.nameParent(p, { attach: [c, from] }).text;
  if (!/yl$/.test(t)) throw new Error("ylidene");
  return { text: `${t}idene`, compound: true };
}

// ——— Parents ———
// Hydrazine, diazene and hydroxylamine as the parent when nothing is cited as a suffix (P-68.3.1): phenylhydrazine,
// 1,1-dimethylhydrazine, (propan-2-ylidene)hydrazine, (E)-diphenyldiazene, N,O-dimethylhydroxylamine. One such group
// only; else undefined, and a carbon parent cites them as prefixes.
export function heteroParentName(n: Namer, kind: string | undefined): string | undefined {
  if (kind === "anhydride") return sulfonicAnhydrideName(n);
  const centre = centreName(n, kind);
  if (centre || kind) return centre;
  const roles = [...n.het.values()];
  const count = (r: string) => roles.filter((x) => x === r).length;
  const pair = (r: string) => { const a = [...n.het].find(([, v]) => v === r)![0]; return [a, n.adj[a].find((j) => n.het.get(j) === r)!]; };
  if (count("NN") === 2 && !count("hz") && !count("N=N")) {
    const [a, b] = pair("NN");
    return hydrazineName(n, a, b);
  }
  if (count("hz") === 2 && !count("NN") && !count("N=N")) {
    const [a, b] = pair("hz");
    return hydrazineName(n, a, b);
  }
  if (count("N=N") === 2 && !count("NN") && !count("hz")) {
    const [a, b] = pair("N=N");
    const subs = [a, b].flatMap((x) => n.adj[x].filter((j) => n.het.get(j) !== "N=N").map((j) => n.substituent(j, x)));
    const ez = n.cipBond.get(n.key(a, b));
    return `${ez === "E" || ez === "Z" ? `(${ez})-` : ""}${substituted(subs)}diazene`;
  }
  if (count("NO") === 2 && !count("NN") && !count("hz") && !count("N=N")) {
    const [a, b] = pair("NO"), [nn, o] = n.el[a] === "N" ? [a, b] : [b, a];
    const list = [...n.adj[nn].filter((j) => j !== o).map((j) => ({ loc: "N", name: n.substituent(j, nn) })), ...n.adj[o].filter((j) => j !== nn).map((j) => ({ loc: "O", name: n.substituent(j, o) }))];
    return `${letterPrefixes(list)}hydroxylamine`;
  }
  return undefined;
}
// Hydrazine with substituents on its two N (locants 1 and 2): lowest locants, then the prefix cited first
// alphabetically takes the lower; no locants with a single substituent (phenylhydrazine).
function hydrazineName(n: Namer, a: number, b: number): string {
  const subs = (x: number, y: number) => n.adj[x].filter((j) => j !== y).map((j) => hydrazineSub(n, j, x));
  const sa = subs(a, b), sb = subs(b, a);
  const list = (first: Name[], second: Name[]) => [...first.map((name) => ({ loc: "1", name })), ...second.map((name) => ({ loc: "2", name }))];
  const options = [list(sa, sb), list(sb, sa)];
  const key = (l: { loc: string; name: Name }[]) => [...l.map((x) => x.loc).sort().join(","), "|", ...l.slice().sort((x, y) => alphaKey(x.name.text).localeCompare(alphaKey(y.name.text))).map((x) => x.loc)].join("");
  options.sort((x, y) => (key(x) < key(y) ? -1 : key(x) > key(y) ? 1 : 0));
  const best = options[0];
  return `${assemblePrefixes(best, best.length === 1)}hydrazine`;
}
// Prefixes with letter locants (N, O): N,O-dimethyl, N,N-diethyl, O-benzyl, in alphabetical order.
function letterPrefixes(list: { loc: string; name: Name }[]): string {
  const groups = new Map<string, { name: Name; locs: string[] }>();
  for (const p of list) { const g = groups.get(p.name.text) ?? { name: p.name, locs: [] }; g.locs.push(p.loc); groups.set(p.name.text, g); }
  return [...groups.values()].sort((x, y) => alphaKey(x.name.text).localeCompare(alphaKey(y.name.text))).map((g) => {
    const m = g.locs.length, word = m > 1 ? (g.name.compound ? `${["", "", "bis", "tris"][m]}${enclose(g.name)}` : MULT[m] + g.name.text) : enclose(g.name);
    return `${g.locs.sort().join(",")}-${word}`;
  }).join("-");
}
