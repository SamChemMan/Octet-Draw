// Octet's IUPAC namer, part 2: groups built on N, O, S, P and the halogens (IUPAC 2013, P-6). Clean room, from the
// published rules. namer.ts calls these functions at a few fixed points (perception, suffixes, prefixes and the
// whole-molecule name); each takes the namer itself. Every name is still read back by OPSIN before the app shows it.
import { enclose, type Name, type Namer } from "./namer.ts";

// ——— Thio analogues (P-65.1.5, P-65.6.3.2.3, P-66.1.4.1, P-66.6.1.3, P-64.6) ———
// =S and -S- in place of =O and -O- in acids, esters, amides, aldehydes, ketones and acid halides. The variant of a
// group carbon: "S" (=O and -S-: thioic S-acid), "O" (=S and -O-: thioic O-acid), "SS" (dithioic acid), "=S" (=S on
// its own: thioamide, thial, thione), or "" for none.
export function thioVariant(n: Namer, c: number): string {
  const d = n.carbonylO[c];
  if (d < 0) return "";
  const x = n.esterO.get(c) ?? n.adj[c].find((j) => j !== d && n.group[j] === "acid" && n.el[j] !== "C");
  const dbl = n.el[d] === "S", single = x !== undefined && n.el[x] === "S";
  return dbl && single ? "SS" : dbl && x !== undefined ? "O" : single ? "S" : dbl ? "=S" : "";
}
// Whether the group carbon's double bond is to S (C=S).
export const thioDouble = (n: Namer, c: number) => n.carbonylO[c] >= 0 && n.el[n.carbonylO[c]] === "S";
const THIO_SUFFIX:Record<string, Record<string, [string, string]>> = {
  acid: { S: ["thioic S-acid", "carbothioic S-acid"], O: ["thioic O-acid", "carbothioic O-acid"], SS: ["dithioic acid", "carbodithioic acid"] },
  ester: { S: ["thioate", "carbothioate"], O: ["thioate", "carbothioate"], SS: ["dithioate", "carbodithioate"] },
  amide: { "=S": ["thioamide", "carbothioamide"] }, aldehyde: { "=S": ["thial", "carbothialdehyde"] },
  ketone: { "=S": ["thione", "thione"] }, halide: { "=S": ["thioyl", "carbothioyl"] },
};
// The suffix for a parent's principal groups when they are thio analogues: ethanethioamide, propane-2-thione,
// benzenecarbothioic S-acid. Groups with =O are senior to those with =S (P-43): when a parent has both, the =S ones
// leave the suffix (sites) and are cited as prefixes (sulfanylidene, carbamothioyl).
export function thioSuffix(n: Namer, kind: string | undefined, sites: { atom: number; group: number }[], used: Set<number>, ring: boolean): string | undefined {
  if (!kind || !sites.length) return undefined;
  const v = sites.map((s) => thioVariant(n, s.group));
  if (v.every((x) => !x)) return undefined;
  if (v.some((x) => !x)) {
    for (const s of sites.filter((_, k) => v[k])) { used.delete(s.group); used.delete(n.carbonylO[s.group]); }
    const keep = sites.filter((_, k) => !v[k]);
    sites.length = 0;
    sites.push(...keep);
    return undefined;
  }
  const t = THIO_SUFFIX[kind]?.[v[0]];
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
// A thio acid, ester or amide group cited as a prefix: sulfanylcarbonyl, hydroxycarbonothioyl, carbamothioyl,
// methoxycarbonothioyl, (methylsulfanyl)carbonyl (P-65.1.7.3, P-65.6.3.2.3, P-66.1.4.1.3). Undefined for others.
export function thioPrefix(n: Namer, x: number, kind: string | undefined): Name | undefined {
  const v = thioVariant(n, x);
  if (!v) return undefined;
  if (kind === "acid") return { text: v === "S" ? "sulfanylcarbonyl" : v === "O" ? "hydroxycarbonothioyl" : "sulfanylcarbonothioyl", compound: true };
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
