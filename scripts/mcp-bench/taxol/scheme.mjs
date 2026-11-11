// Nicolaou taxol (Nature 1994, 367, 630): three schemes as the paper's Figs 2, 3 and 5, drawn by Octet's MCP.
// Each structure is taxol's own SMILES (PubChem) cut down, so every stereocentre keeps taxol's tag; groups are * with
// labels (OTBS, OTPS, OBn, OTES, OAc, OBz), in the order they appear.
import { writeFileSync } from "node:fs";
const G = { TBS: "O[Si](C)(C)C(C)(C)C", TPS: "O[Si](c%30ccccc%30)(c%31ccccc%31)C(C)(C)C", BN: "OCc%20ccccc%20", TES: "O[Si](CC)(CC)CC", AC: "OC(C)=O", BZ: "OC(=O)c%21ccccc%21" };
const LBL = { TBS: "OTBS", TPS: "OTBDPS", BN: "OBn", TES: "OTES", AC: "OAc", BZ: "OBz" };
// A template with {TBS} etc. becomes a SMILES with * and its labels in order.
const mk = (t, number) => { const labels = []; const s = t.replace(/\{(\w+)\}/g, (_, k) => (labels.push(LBL[k]), "*")); return { text: s, labels, number: String(number) }; };
const full = (t) => t.replace(/\{(\w+)\}/g, (_, k) => G[k]);
const core = ({ c10x = "{AC}", c9 = "C(=O)", c7x, c65, c20, x4, c13 = "C1", x1 = "O%13", x2 = "OC%13=O" }) =>
  `CC1=C2[C@H](${c9}[C@@]3([C@H](${c65}[C@]([C@H]3[C@@H]([C@@](C2(C)C)(C${c13})${x1})${x2})(${c20})${x4})${c7x})C)${c10x}`;
const cring = ({ c9, c7x, c2, c20, x4 }) => `${c9}[C@@]3([C@H](C=C[C@]([C@H]3${c2})(${c20})${x4})${c7x})C`;
const ACET = { c20: "CO%10", x4: "OC%10(C)C" };
const T = {
  2: cring({ c9: "CCOC(=O)", c7x: "O", c2: "CO%10", c20: "C%10=O", x4: "O" }),
  3: cring({ c9: "OC", c7x: "{TBS}", c2: "CO%10", c20: "C%10=O", x4: "{TBS}" }),
  4: cring({ c9: "C({TPS})", c7x: "{BN}", c2: "CO%10", c20: "C%10=O", x4: "{TBS}" }),
  5: cring({ c9: "C({TPS})", c7x: "{BN}", c2: "CO", c20: "CO", x4: "O" }),
  6: cring({ c9: "C({TPS})", c7x: "{BN}", c2: "CO", ...ACET }),
  7: cring({ c9: "C({TPS})", c7x: "{BN}", c2: "C=O", ...ACET }),
  8: `CC1=C(C{TBS})C(C)(C)C(=NNS(=O)(=O)c2c(C(C)C)cc(C(C)C)cc2C(C)C)CC1`,
  9: cring({ c9: "C({TPS})", c7x: "{BN}", c2: `[C@@H](C%11=CCC(C)=C(C{TBS})C%11(C)C)O`, ...ACET }),
  10: cring({ c9: "C({TPS})", c7x: "{BN}", c2: `[C@@H]([C@@]%11%12(C(C)(C)C(C{TBS})=C(C)CC%11O%12))O`, ...ACET }),
  11: cring({ c9: "C({TPS})", c7x: "{BN}", c2: `[C@@H]([C@]%11(C(C)(C)C(C{TBS})=C(C)CC%11)O)O`, ...ACET }),
  12: cring({ c9: "O=C", c7x: "{BN}", c2: `[C@@H]([C@]%11(C(C)(C)C(C=O)=C(C)CC%11)O%13)OC%13=O`, ...ACET }),
  13: core({ c10x: "O", c9: "C(O)", c7x: "{BN}", c65: "C=C", ...ACET }),
  14: core({ c7x: "{BN}", c65: "C=C", ...ACET }),
  15: core({ c7x: "{BN}", c65: "C[C@H](O)", c20: "CO", x4: "O" }),
  16: core({ c7x: "{BN}", c65: "C[C@H](O)", c20: "C{AC}", x4: "O" }),
  17: core({ c7x: "{TES}", c65: "C[C@H](O)", c20: "CO", x4: "O" }),
  18: core({ c7x: "{TES}", c65: "C[C@@H]4", c20: "CO4", x4: "O" }),
  19: core({ c7x: "{TES}", c65: "C[C@@H]4", c20: "CO4", x4: "{AC}" }),
  20: "[C@@H]1({TES})[C@H](N(C1=O)C(=O)c2ccccc2)c3ccccc3",
  1: core({ c7x: "O", c65: "C[C@@H]4", c20: "CO4", x4: "{AC}", c13: "[C@@H]1OC(=O)[C@@H]([C@H](c5ccccc5)NC(=O)c6ccccc6)O", x1: "O", x2: "{BZ}" }),
};
export const FULL = Object.fromEntries(Object.entries(T).map(([k, v]) => [k, full(v)]));
const s = (n) => mk(T[n], n);
const scheme1 = { start: [s(2)], steps: [
  { above: ["a) TBSOTf, 2,6-lutidine", "b) LiAlH4, Et2O, 0 °C"], below: ["a) 95%; b) 94%"], products: [s(3)] },
  { above: ["c) CSA, MeOH; then", "TBDPSCl, imidazole, DMF", "d) KH, BnBr, n-Bu4NI"], below: ["c) 90%, 92%; d) 87%"], products: [s(4)] },
  { reagents: ["LiAlH4"], solvents: ["Et2O"], temperature: "25 °C", yield: "80%", products: [s(5)] },
  { reagents: ["Me2C(OMe)2", "CSA"], solvents: ["CH2Cl2"], yield: "82%", products: [s(6)] },
  { reagents: ["TPAP", "NMO"], solvents: ["MeCN"], yield: "95%", products: [s(7)] },
] };
const scheme2 = { start: [s(8), s(7)], steps: [
  { above: ["n-BuLi, THF", "−78 → 25 °C; then 7"], below: ["82% (Shapiro)"], products: [s(9)] },
  { reagents: ["VO(acac)2", "t-BuOOH"], solvents: ["PhH"], yield: "87%", products: [s(10)] },
  { reagents: ["LiAlH4"], solvents: ["Et2O"], yield: "76%", products: [s(11)] },
  { above: ["d) KH, COCl2, HMPA", "e) TBAF, THF", "f) TPAP, NMO"], below: ["48%, 80%, 82%"], products: [s(12)] },
  { above: ["(TiCl3)2(DME)3", "Zn–Cu, DME, 70 °C"], below: ["23% (McMurry)"], products: [s(13)] },
] };
const scheme3 = { start: [s(13)], steps: [
  { above: ["a) Ac2O, DMAP", "b) TPAP, NMO"], below: ["95%, 93%"], products: [s(14)] },
  { above: ["c) BH3·THF; H2O2", "d) HCl, MeOH"], below: ["55%, 80%"], products: [s(15)] },
  { reagents: ["Ac2O", "DMAP"], solvents: ["CH2Cl2"], yield: "95%", products: [s(16)] },
  { above: ["f) H2, Pd(OH)2/C", "g) TESCl, pyridine", "h) K2CO3, MeOH"], below: ["97%, 85%, 95%"], products: [s(17)] },
  { above: ["i) TMSCl, pyridine", "j) Tf2O, i-Pr2NEt", "k) CSA, MeOH; SiO2"], below: ["96%, 70%, 60%"], products: [s(18)] },
  { reagents: ["Ac2O", "DMAP"], solvents: ["CH2Cl2"], yield: "94%", products: [s(19)] },
  { above: ["1) PhLi; 2) PCC; 3) NaBH4", "4) NaHMDS, 20; 5) HF·py"], below: ["80%, 75%, 83%, 87%, 80%"], products: [{ ...s(1), number: "1 (taxol)" }] },
] };
export const SCHEMES = [scheme1, scheme2, scheme3];
if (process.argv[2] === "write") {
  for (const [i, sc] of SCHEMES.entries()) writeFileSync(`./scheme${i + 1}.json`, JSON.stringify(sc));
  console.log("written");
}
