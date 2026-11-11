// Run: node src/notation.check.ts. The line notation (notation.ts): what an AI app writes to draw, read into the
// arguments the drawing code takes, with no window (scripts/headless). The 60 jobs of the paper corpus and the taxol
// route written in it give the same drawing as their JSON (each compound by its number and InChIKey, every text, and
// each arrow's kind with the words and structures over and under it); a table of hard cases gives its arguments or
// its refusal; the description fits its room and its own example draws; and the reader is quick, also on hostile text.
// It prints each job's characters as JSON and as notation.
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";

if (!existsSync(new URL("./vendor/opsin/opsin.js", import.meta.url))) { console.log("notation.check: skipped (no OPSIN build)"); process.exit(0); }
const { load, drawing, session } = await import("../scripts/headless/host.ts");
const { handle } = await import("./mcp.ts");
const { callOf, fromLines, NOTATION } = await import("./notation.ts");
await load();

const words = (t: string) => t.split(/[\s,;]+/).filter(Boolean);
// What a drawing shows: each structure by its number and InChIKey; each arrow's kind with the words and structures
// over and under it (line breaks and the order of items aside); and every other text.
// Each drawing is in one session, whose brief (plan 3.1) is given once: these drawings are for a paper.
let d = drawing("paper");
const call = async (n: string, a: unknown) => JSON.parse(await handle(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: n, arguments: a } }), () => d.host, "1", session("Check", "notation"))).result;
assert.ok(!(await call("set_brief", { destination: { kind: "paper" } })).isError);
async function shown(name: string, args: unknown) {
  d = drawing("paper");
  const r = await call(name, args);
  if (r.isError) return { refused: r.content[0].text };
  const full = (await call("read", { detail: "full" })).structuredContent, m = d.host.doc();
  const key = new Map<string, string>(full.structures.map((s: { id: string; inchiKey: string }) => [s.id, s.inchiKey])), kind = new Map((m.arrows ?? []).map((a) => [`a${a.id}`, a.kind]));
  const side = (l: string[] = []) => l.flatMap((x) => (key.has(x) ? [`@${key.get(x)}`] : words(x))).sort().join(" ");
  return {
    structures: full.structures.map((s: { number?: string; inchiKey: string }) => `${s.number ?? ""}=${s.inchiKey}`).sort(),
    arrows: full.reactions.flatMap((x: { steps: { arrow: string; above?: string[]; below?: string[] }[] }) => x.steps.map((s) => `${kind.get(s.arrow)} | ${side(s.above)} | ${side(s.below)}`)).sort(),
    text: (m.captions ?? []).filter((c) => !c.on).map((c) => `${c.cycle ? `${c.cycle.side}:` : ""}${c.text.replace(/\s+/g, " ")}`).sort(),
  };
}

// ---- The description ----

// It goes in the tool list, which is 14,000 characters in all.
assert.ok(NOTATION.length <= 610, `${NOTATION.length}`);
// Its own example draws, with no refusal: 3 and 4 by InChIKey, the second from the first.
{
  const r = fromLines({ lines: NOTATION.split("\n").slice(1, 3).join("\n") });
  assert.ok(typeof r !== "string", String(r));
  const s = await shown(...callOf(r));
  assert.ok("structures" in s, JSON.stringify(s));
  assert.ok(s.structures.includes("3=RHDYQUZYHZWTCI-UHFFFAOYSA-N") && s.structures.includes("4=YXVFYQXJAXKLAK-UHFFFAOYSA-N"), s.structures.join(" "));
}

// ---- The paper corpus and the taxol route, as notation ----

// Each job as a chemist writes it from the paper: ^ and _ where the JSON put a condition on the other side from where
// Octet puts it, and "..." for a line kept as the JSON had it.
const NOTES: Record<string, string> = {
  "gaunt2007-fig1": "2-methyl-2-(3-oxobutyl)cyclopentane-1,3-dione (1) -> C[C@]12CCC(=O)C[C@@]1(O)CCC2=O (2), @L-proline, _\"20 mol% catalyst\", _\"CHCl3, r.t.\", 99% ee",
  "gaunt2007-fig1-cycle": "L-proline (1) -> C/C(CCC1(C)C(=O)CCC1=O)=[N+]1\\CCC[C@H]1C([O-])=O (2), +triketone -> OC(=O)[C@@H]1CCCN1C(=C)CCC1(C)C(=O)CCC1=O (3) -> C[C@]12CC/C(=[N+]3/CCC[C@H]3C([O-])=O)C[C@@]1(O)CCC2=O (4) -> 1, -ketol",
  "gaunt2007-fig3": "O=CC{OTIPS} (1) + O=CC{OTIPS} -> O=C[C@@H]({OTIPS})[C@@H](O)C{OTIPS} (2), L-proline (20 mol%), DMF, 4 °C, 4:1 anti:syn, 95% ee, 92%\n-> {TIPSO}C[C@@H]1OC(O)[C@@H]({OAc})[C@H](O)[C@H]1{OTIPS} (3), MgBr2, Et2O, @(Z)-2-(trimethylsilyloxy)vinyl acetate",
  "gaunt2007-fig8": "O=CCCCC[n+]1cc2ccccc2c2ccccc12.[I-] (1) -> OC[C@H]1CCCN2c3ccccc3-c3ccccc3[C@H]12 (2), @(2S,5S)-2,5-dibenzylpyrrolidine, _\"10 mol% catalyst\", _\"CH2Cl2, Et3N, −40 °C\", _\"then NaBH4, EtOH\", 49–96% ee, 18–73%",
  "gaunt2007-fig9": "{EtO2C}C({CO2Et})(CCCI)CC=O (1) -> {EtO2C}C1({EtO2C})CCC[C@H]1C=O (2), @(S)-2-methylproline, _\"10 mol% catalyst\", _\"Et3N, CHCl3, −30 °C\", 95% ee, 92%",
  "gaunt2007-fig11d": "(2E,8E,10E)-dodeca-2,8,10-trienal (1) -> C[C@@H]1C=C[C@@H]2CCCC[C@H]2[C@@H]1C=O (2), @(5S)-5-benzyl-2,2,3-trimethylimidazolidin-4-one, _\"20 mol% catalyst·TfOH\", MeCN, 50 °C, >20:1 dr, 90% ee, 71%\n-> C[C@@H]1C=C[C@@H]2CCCC[C@H]2[C@@H]1c1cc(OC)c(C=O)c(=O)o1 (3), five steps",
  "gaunt2007-fig13": "crotonaldehyde (1) + 1-(4-bromobenzyl)-5-methoxy-2-methyl-1H-indole (2) -> C[C@H](CC(O)=O)c1c(C)n(Cc2ccc(Br)cc2)c2ccc(OC)cc12 (3), @(2S,5S)-5-benzyl-2-tert-butyl-3-methylimidazolidin-4-one, _\"20 mol% catalyst·HO2CCF3\", _\"then AgNO3, NaOH\", 87% ee, 82%",
  "gaunt2007-fig14": "C=CCn1cc(CC{NHBoc})c2ccccc12 (1) + methyl (E)-4-oxobut-2-enoate (2) -> O=CC[C@@H]({CO2Me})[C@@]12CCN({Boc})[C@@H]1N({Allyl})c1ccccc12 (3), @(2S,5S)-5-benzyl-2-tert-butyl-3-methylimidazolidin-4-one, _\"20 mol% catalyst·HO2CCF3\", CH2Cl2, 91% ee, 44:1 dr, 93%",
  "gaunt2007-fig17": "(E)-3-phenylbut-2-enal (1) -> C[C@H](c1ccccc1)[C@H](F)C=O (2), @(R)-2-tert-butyl-3-methylimidazolidin-4-one, @Hantzsch ester, _\"7.5 mol%, CHCl3\", _\"then\", _@(2R,5R)-5-benzyl-2-tert-butyl-3-methylimidazolidin-4-one, _@NFSI, _\"30 mol% catalyst, THF–iPrOH\", >16:1 dr, 99% ee, 81%",
  "gaunt2007-catalysts": "L-proline (1)\n(S)-2-methylproline (2)\n(2S,5S)-2,5-dibenzylpyrrolidine (3)\n(S)-indoline-2-carboxylic acid (4)\n(S)-diphenylprolinol trimethylsilyl ether (5)\n(S)-2-[methoxy(diphenyl)methyl]pyrrolidine (6)\n(5S)-5-benzyl-2,2,3-trimethylimidazolidin-4-one (7)\n(2S,5S)-5-benzyl-2-tert-butyl-3-methylimidazolidin-4-one (8)\n(2S,5S)-5-benzyl-3-methyl-2-(5-methylfuran-2-yl)imidazolidin-4-one (9)\n(4R)-2,2-dimethyl-N-(naphthalen-1-yl)-1,3-thiazolidine-4-carboxamide (10)\nO[C@H]1Cc2ccccc2[C@H]1NC(=S)Nc1cc(cc(c1)C(F)(F)F)C(F)(F)F (11)",
  "grocott2025-fig2a": "{Bn}CC=C (2a) -> {Bn}C/C=C/CS(=O)(=O)C{OTBS} (3a), @C=CCS(=O)(=O)CO[Si](C)(C)C(C)(C)C, 1a (4 equiv.), _\"5 mol% HG-II catalyst\", CH2Cl2, 40 °C, 8 h, 100% AY\n-> {Bn}CCC=C (4a), MeOH-HCl, _\"or TBAF, citric acid\", MeOH, 40 °C, 16 h, 99% AY",
  "grocott2025-fig2a-catalyst": "Hoveyda–Grubbs II catalyst (HG-II)",
  "grocott2025-fig2b": "methyl dodec-11-enoate (4b) | 1-nonadecene (4c) | N#Cc1ccc(cc1)[C@H]1CC[C@H](CC=C)CC1 (4d) | {n-Bu}[C@H]1CC[C@@H](CC1)[C@H]1CC[C@H](CC=C)CC1 (4e)\nC=CCCc1ccc({OMe})c({OMe})c1 (4f) | C=CCCc1cc({OMe})c(O)c(c1){CO2Me} (4g) | C=CCCc1cc({OMe})c(O)c(c1)C(=O)NCCO (4h) | {Et}c1oc2ccccc2c1C(=O)c1cc(Br)c(OCCCCCC=C)c(Br)c1 (4i)\n{Pr2N}S(=O)(=O)c1ccc(cc1)C(=O)NCCC=C (4j) | CC(C)(Oc1ccc(cc1)C1CC1(Cl)Cl)C(=O)OCCCCC=C (4k) | C=CCC(C)Cc1ccc2OCOc2c1 (4l) | C=CCCCC[C@](C)(N{Fmoc})C(=O){OMe} (4m)\nC=CC[C@H](CO)N1C(=O)c2ccccc2C1=O (4n) | C=CC[C@H]({Bn})N{Boc} (4o) | C=CC[C@@H](C)[C@@H](O)c1ccc({OMe})cc1 (4p) | C=CCc1ccc({OBn})c({OMe})c1 (4q)\nC=CCc1cc(Br)cc(c1){CF3} (4r) | 1-allyl-4-nitrobenzene (4s) | {n-Pr}c1cn(C)c2c1nc([nH]c2=O)-c1cc(ccc1{OEt})S(=O)(=O)N({Bn})CCC=C (4t) | {OMe}C1=C2C(=CC(=C1N3C[C@@H]4CCCN(C(=O)CC(C)CC=C)[C@@H]4C3)F)C(=O)C(=CN2C5CC5)C(=O)O (4u)",
  "grocott2025-fig2c": "#\nC[C@]12CCCC([C@@H]1CC[C@@]([C@@H]2CC[C@](C)(CC=C)O)(C)O)(C)C (5) 51%\\nhomosclareol | C[C@]12CC[C@H]3[C@H]([C@@H]1CC[C@]2(CCC=C)O)CCC4=CCCC[C@H]34 (6) 63%\\nhomoallylestrenol | CC(=O)O[C@H]1[C@H]([C@@H]2[C@]([C@H](CCC2(C)C)O)([C@@]3([C@@]1(O[C@@](CC3=O)(C)CC=C)C)O)C)O (7) 26% (47% brsm)\\nhomoforskolin | {OMe}C=1C=C2C(=CC=NC2=CC1)[C@@H](O)[C@H]1N2C[C@@H]([C@H](C1)CC2)CC=C (8) 75%\\nhomoquinine",
  "grocott2025-fig3a": "grazoprevir -> COC1=CC2=NC3=C(CCCCC[C@@H]4C[C@H]4OC(=O)N[C@H](C(=O)N5C[C@@H](C[C@H]5C(=O)N[C@@]6(C[C@H]6CC=C)C(=O)NS(=O)(=O)C7CC7)O3)C(C)(C)C)N=C2C=C1 (9), _\"10 equiv. 1a\", _\"20 mol% HG-II catalyst\", CH2Cl2, 40 °C, 8 h;, _\"MeOH-HCl, 40 °C\", 43%",
  "grocott2025-fig3b": "tacrolimus -> C[C@@H]1C[C@@H]([C@@H]2[C@H](C[C@H]([C@@](O2)(C(=O)C(=O)N3CCCC[C@H]3C(=O)O[C@@H]([C@@H]([C@H](CC(=O)[C@@H](/C=C(/C1)\\C)CCC=C)O)C)/C(=C/[C@@H]4CC[C@H]([C@@H](C4)OC)O)/C)O)C)OC)OC (10), 1a (10 equiv.), HG-II (10 mol%), CH2Cl2, 40 °C, 16 h, _\"then TBAF/citric acid, MeOH, 40 °C\", 53%",
  "grocott2025-fig4a": "rotenone -> C=CC(C)[C@H]1CC2=C(O1)C=CC3=C2O[C@@H]4COC5=CC(=C(C=C5[C@@H]4C3=O){OMe}){OMe} (11a), @CC(C)=CCS(=O)(=O)CO[Si](C)(C)C(C)(C)C, 1b, _\"3 equiv. 1b\", _\"20 mol% HG II catalyst\", _\"(CH2Cl)2, 100 °C, 16 h (94% AY)\", _\"then\", _\"TBAF/citric acid, MeOH, 100 °C\", 73% (1:1 d.r.)",
  "grocott2025-fig4c": "C=C[C@H]({Bn})N{Boc} -> C/C=C/C[C@H]({Bn})N{Boc} (16), @C=CC(C)S(=O)(=O)CO[Si](C)(C)C(C)(C)C, 4 equiv. 1c, _\"5 mol% HG-II catalyst\", CH2Cl2, 40 °C, 16 h, _\"then TBAF, citric acid\", MeOH, 40 °C, 16 h, 60% (70:30 E:Z)",
  "grocott2025-fig4d": "{Bn}C/C=C\\C(C)S(=O)(=O)C{OTBS} ((Z)-17) -> {Bn}CC/C=C/C ((E)-18), TBAF, citric acid, MeOH, 40 °C, 16 h, 90%",
  "grocott2025-fig4e": "O=C1CCCCCCC/C=C\\CCCCCCO1 -> non-8-en-1-yl undec-10-enoate (19), 8 equiv. 1a, 10 mol% HG-II, \"CH2Cl2, 40 °C, 16 h\", _\"then TBAF/citric acid\", MeOH, 40 °C, 16 h, 81%\n-> O=C1CCCCCCCC/C=C\\CCCCCCCO1 (20), ^7.5 mol% M2001 catalyst, _\"(CH2Cl)2 (5 mM), 60 °C\", _\"~20 mbar, 24 h\", 74% AY (1:9 E:Z)",
  "proctor2019-scheme39": "5-(4-chlorophenyl)pyrimidine-2,4-diamine + ethylboronic acid -> pyrimethamine (41), 2 equiv. TFA, 1 atm O2, AcOH/MeCN, 110 °C, 10 h, 70%",
  "proctor2019-scheme47": "OC(=O)C1(CC1){CF3} (1) -> S=C1C=CC=CN1OC(=O)C1(CC1){CF3} (2), \"(COCl)2\", _\"then\", _@S=C1C=CC=CN1O[Na]\n-> {CF3}C1(CC1)Sc1ccccn1 (3), ^visible light, EtOAc\n-> {CF3}C1(CC1)S(=O)(=O)c1ccccn1 (4), RuCl3, NaIO4, 50%\n-> [Na]OS(=O)C1(CC1){CF3} (5), NaOEt, 75%\n-> Oc1nc2ccccc2nc1C1(CC1){CF3} (6), @quinoxalin-2-ol, 1 equiv. TsOH·H2O, 5 equiv. t-BuOOH, 1.5 equiv. ZnCl2, 2.5:1 CH2Cl2:H2O (0.18 M), 0 °C to rt, 1–48 h, 77%",
  "proctor2019-scheme9-mechanism": "{tBu}c1ccc(cc1)C([O-])=O -> {tBu}c1ccc(cc1)C([O])=O (12), SET, _\"*Ir(III) to Ir(II)\"\n-> {tBu}c1ccc(cc1)C(=O)OBr (11), 13\n-> {tBu}c1cc[c]cc1 (A), SET, _\"Ir(II) to Ir(III)\", _\"− Br−, − CO2\"\n-> {tBu}c1ccc(cc1)-c1ccccn1 (B), pyridine, _\"− e−, − H+\"",
  "proctor2019-scheme45-one-pot": "quinine -> COc1cc2c(cc1{CF3})nc({iPr})cc2[C@@H](O)[C@@H]1C[C@@H]2CCN1C[C@@H]2C=C (1), [Zn](SO2CF3)2, standard conditions, _\"then [Zn](SO2i-Pr)2 and t-BuOOH\", _\"(one pot)\", 30%",
  "proctor2019-scheme68-quinoline": "quinoline + 1-methylcyclohexene -> 2-(1-methylcyclohexyl)quinoline + 4-(1-methylcyclohexyl)-1,2,3,4-tetrahydroquinoline (51), 1.0 equiv. Fe(acac)3, 1.5 equiv. PhSiH3, 2.0 equiv. BF3·Et2O, THF/MeOH, 60 °C, 4 h, _\"44% and 34% (51)\"",
  "proctor2019-scheme53": "6-bromobenzoxazole + bromocyclopentane -> 6-bromo-2-cyclopentylbenzoxazole, 1.2 equiv. t-BuONa, 10 mol% 47, 10 mol% BDMAEE, toluene, 80–100 °C, 16 h, 64%\n{NMe2}c1ccccc1N1[Cu]({PPh3})N(C)(C)c2ccccc12 (47)\nbis(2-dimethylaminoethyl) ether (BDMAEE)",
  "proctor2019-scheme72-52": "metyrapone + CC(C)C({NHAc})C(=O)ON1C(=O)c2ccccc2C1=O -> {NHAc}[C@@H](C(C)C)c1ccc(cn1)C(=O)C(C)(C)c1cccnc1 (52), 1 mol% [Ir(dF(CF3)ppy)2(dtbpy)]PF6, 5 mol% (R)-TRIP or (R)-TCYP, 1,4-dioxane (0.1 M), _\"blue LEDs, rt, 14 h\", 70%, 95% ee",
  "proctor2019-scheme72-73-scope": "# Quinolines and pyridines\n## Scheme 72\n{NHAc}[C@@H](C)c1cc(C)c2ccccc2n1 (72a) 91% yield\\n94% ee | {NHAc}[C@@H](Cc1c[nH]c2ccccc12)c1cc(C)c2ccccc2n1 (72b) 91% yield\\n93% ee | {NHAc}[C@@H](C{Ph})c1ccc2cc({OMe})ccc2n1 (72c) 82% yield\\n94% ee\n{NHAc}[C@@H](C(C)C)c1ccc(cn1)C(=O)OCCOC(=O)C(C)(C)Oc1ccc(Cl)cc1 (72d) 86% yield\\n93% ee | {NHAc}[C@@H](C(C)C)c1ccc(cn1)C(=O)C(C)(C)c1cccnc1 (52) 70% yield\\n95% ee\n# Isoquinolines\n## Scheme 73\n{OEt}C(=O)N[C@@H]({Bn})c1nccc2cc(Br)ccc12 (73a) 80% yield\\n82% ee | {OEt}C(=O)N[C@@H](Cc1c[nH]c2ccccc12)c1nccc2ccccc12 (73b) 85% yield\\n82% ee | {OEt}C(=O)N[C@@H](Cc1ccc({OAc})cc1)c1nccc2ccccc12 (73c) 84% yield\\n84% ee | {OEt}C(=O)N[C@@H](CC(C)C)c1nccc2ccccc12 (73d) 82% yield\\n66% ee",
  "proctor2019-scheme40-scope": "C=CCCOCc1ccc2ccccc2n1 (40a) | {iPr}c1n[nH]c2ccccc12 (40b) | CC(=O)c1ccc(CC{Ph})c(n1)C(C)=O (40c) | {tBu}c1nc(NCc2ccccc2)c2[nH]cnc2n1 (40d)\n{tBu}c1cccc(n1)-c1cccc(n1)-c1ccccn1 (40e) | {CO2Me}c1cc2ccccc2c(n1)C1CCN(CC1)c1cccnc1 (40f) | O=C1CC(Oc2ccc(cc12)-c1ccc(C)o1)c1cc({CF3})ccn1 (42)",
  "proctor2019-scheme11-chain": "# radical chain\nC[CH]C (A) -> CC(C)C1C=C(C)c2ccccc2[NH+]1 (B), +4-methylquinoline·H+ -> CC(C)[C]1C=C(C)c2ccccc2N1 (C), -H+ -> A, +15, -product·H+, -PhI, -RCO2−, -CO2",
  "robinson2026-fig2-reaction": "4-benzylmorpholine (1a) + BrC{BF3K} (3a) -> F[B-](F)(F)C[N+]1(Cc2ccccc2)CCOCC1 (4a), MeCN, 90 °C, 98%\n-> 4-(2-phenylethyl)morpholine (2a), t-BuOK, Pd(PhCN)2Cl2 (5 mol%), RuPhos (10 mol%), 1,4-dioxane/H2O, 90 °C, 86% (assay)",
  "robinson2026-fig2-mechanism": "# L = RuPhos\n{L}[Pd] -> {L}[Pd+](Cc1ccccc1)N1(C[B-](F)(F)F)CCOCC1 (int-I), +4a, OA -> {L}[Pd+]Cc1ccccc1 (int-II), -int-III -> {L}[Pd](Cc1ccccc1)CN1CCOCC1 (int-IV), +int-III, TM -> {L}[Pd], -2a, RE",
  "robinson2026-fig3a": "donepezil -> COc1cc2CC(CC3CC[N+](C[B-](F)(F)F)(Cc4ccccc4)CC3)C(=O)c2cc1OC, N-alkylation, _@potassium (bromomethyl)trifluoroborate, 92%\n-> COc1cc2CC(CC3CCN(CCc4ccccc4)CC3)C(=O)c2cc1OC (5), _\"Pd catalyst\", 62%",
  "robinson2026-fig3b": "# Late-stage one-carbon homologation\nlomerizine \"lomerizine\" | tinoridine \"tinoridine\" | piribedil \"piribedil\"\nCOc1ccc(CCN2CCN(CC2)C(c2ccc(F)cc2)c2ccc(F)cc2)c(OC)c1OC (6) 88%, 96% | CCOC(=O)c1c(N)sc2CN(CCc3ccccc3)CCc12 (8) 98%, 25% | c1cnc(nc1)N1CCN(CCc2ccc3OCOc3c2)CC1 (9a) 86%, 95% | [2H]C([2H])(Cc1ccc2OCOc2c1)N1CCN(CC1)c1ncccn1 (9b) 83%, 67%",
  "robinson2026-fig3c": "O=C1CCC(N2Cc3cc(ccc3C2=O)C2CCN(Cc3ccccc3)CC2)C(=O)N1{PMB} + BrC{Bpin} (3b) -> O=C1CCC(N2Cc3cc(ccc3C2=O)C2CCN(CCc3ccccc3)CC2)C(=O)N1{PMB} (10), (i) 3b (1.5 equiv.), MeCN, RT; then KHF2, HCl (ii) Pd·PEPPSI-IPent (5 mol%), K3PO4, _i-PrOH, _1,4-dioxane/H2O, _90 °C, _(iii) CDI, CHCl3, 65 °C, 47%",
  "robinson2026-fig4a-scope": "C[C@H]1C[C@@H](C)CN(CC{Ph})C1 (2e)\nC1COC2(O1)CCN(CC{Ph})CC2 (2f)\nOC1({Ph})CCN(CC{Ph})CC1 (2g)\n{CO2Et}C1CCCN(CC{Ph})C1 (2h)\nO=C1CC2(CCN(CC{Ph})CC2)Oc2ccccc12 (2i)\nC1CCN(CC{Ph})C1 (2j)\n{Boc}N1CCC2(C1)CCN(CC{Ph})C2 (2k)\n{Boc}N1CCC2(CC1)CN(CC{Ph})C2 (2l)\n{Boc}N1CCCN(CC{Ph})CC1 (2m)\nFc1ccc(cc1)[C@@H]1CCN(CC{Ph})C[C@H]1COc1ccc2OCOc2c1 (2n)\nCN(C)CC{Ph} (2o)\nC=CCCCN(C)CC{Ph} (2p)\nCN(C)C(=O)CN(C)CC{Ph} (2q)\nCN(CC{Ph})CC[C@H](Oc1cccc2ccccc12)c1cccs1 (2r)\nCOc1cc2CCN(CC{Ph})Cc2cc1OC (2s)\nc1ccc2c(c1)[nH]c1CN(CC{Ph})CCc21 (2t)\nCN(CC{Ph})c1ccccc1 (2u)\nc1ccc(cc1)N1CCN(CC{Ph})CC1 (2v)\nC[C@H]1CN({Boc})CCN1CC{Ph} (2w)",
  "robinson2026-fig4a-2x": "C[C@@H](N(C)C)c1ccccc1 -> C[C@H](CN(C)C)c1ccccc1 (2x), 1. BrCH2BF3K (3a), 78% 2. Pd·PEPPSI-IPent, K3PO4, 42%, _inversion at the benzylic carbon",
  "robinson2026-fig5a": "piribedil + {TsO}CCC=C (11a) -> C=CCC[N+]1(Cc2ccc3OCOc3c2)CCN(CC1)c1ncccn1.[O-]{Ts} (12a), _\"N-alkylation\"\n-> {BBN}CCCC[N+]1(Cc2ccc3OCOc3c2)CCN(CC1)c1ncccn1.[O-]{Ts} (13a), 9-BBN–H\n-> c1cnc(nc1)N1CCN(CCCCCc2ccc3OCOc3c2)CC1 (14a), SPhos·Pd-G3, _\"t-BuOK\", 47% (64% assay)",
  "robinson2026-fig5b": "{TsO}CCOCC=C (15)\n{TsO}CCOCCOCCC=C (16)\n{TsO}CC(=O)N1CCC(CC=C)CC1 (17)\n{TsO}CCOc1ccc({Bpin})cc1 (18)\n{OTs}CC(=O)N1CCN(CC1)c1ccc({Bpin})cc1 (19)",
  "robinson2026-fig5d": "dibenzylmethylamine -> CN(Cc1ccccc1)CCc1ccccc1 (27), 1. 3b, MeCN, 23 °C; KHF2, HCl (81%) _2. Pd(PhCN)2Cl2 (10 mol%), RuPhos, t-BuOK, 1,4-dioxane/H2O, 90 °C (78%)\n-> CN(CCc1ccccc1)CC(=O)N1CCN(CC1)c1ccc(Cc2ccccc2)cc1 (28), 1. 19, MeCN, 60 °C (64%) _2. RuPhos·Pd-G3 (10 mol%), K3PO4, 1,4-dioxane/H2O, 90 °C (75%)",
  "trowbridge2018-fig2a": "butyraldehyde (1a) + dibenzylamine (2a) + butyl acrylate (3a) -> CCCC(N({Bn}){Bn})CC{CO2Bu} (5a), 1 mol% Ir(ppy)3, ^40 W blue LED, Hantzsch ester 4a, _\"20 mol% propionic acid, 4 Å mol. sieves\", CH2Cl2, RT, 2 h, 84%",
  "trowbridge2018-fig2a-catalyst": "{EtO2C}C1=C(C)NC(C)=C({CO2Et})C1 (4a)\nfac-Ir(ppy)3 (Ir(ppy)3)",
  "trowbridge2018-fig2b-aldehydes": "CCCC(N({Bn}){Bn})CC{CO2Bu} (5a)\n{MeO}C(=O)CCC(N({Bn}){Bn})CC{CO2Bu} (5b)\n{TBSO}CCCC(N({Bn}){Bn})CC{CO2Bu} (5c)\nc1ccccc1CCC(N({Bn}){Bn})CC{CO2Bu} (5d)\n{Boc}n1cc(CCC(N({Bn}){Bn})CC{CO2Bu})c2ccccc12 (5e)\nCc1ccc(CCC(N({Bn}){Bn})CC{CO2Bu})o1 (5f)\nCC(C)C(N({Bn}){Bn})CC{CO2Bu} (5g)\nC1CCCCC1C(N({Bn}){Bn})CC{CO2Bu} (5h)\n{Boc}N1CCC(CC1)C(N({Bn}){Bn})CC{CO2Bu} (5i)\nC1COCCC1C(N({Bn}){Bn})CC{CO2Bu} (5j)\n{Boc}N1CC(C1)C(N({Bn}){Bn})CC{CO2Bu} (5k)\nFC1(F)CC(C1)C(N({Bn}){Bn})CC{CO2Bu} (5l)\nC(N({Bn}){Bn})CC{CO2Bu} (5m)",
  "trowbridge2018-fig3a-cycle": "Ir(ppy)3 (Ir(III)) -> Ir(ppy)3 (Ir(III)*), 40 W blue lamp -> [Ir-]123(C4=CC=CC=C4C4=CC=CC=N41)(C1=CC=CC=C1C1=CC=CC=N12)C1=CC=CC=C1C1=CC=CC=N13 (Ir(II)), +4a, -4a′ -> Ir(III), +Int-I, -Int-II, SET",
  "trowbridge2018-fig3a-pathway": "butyraldehyde (1a) + dibenzylamine (2a) -> CCCC=[N+]({Bn})Cc1ccccc1 (Int-I), H+, _\"− H2O\"\n-> CCC[CH]N({Bn})Cc1ccccc1 (Int-II), [Ir(II)ppy3]−, _\"SET\"\n-> CCCC(C[CH]{CO2Bu})N({Bn})Cc1ccccc1 (Int-IV), @butyl acrylate, _\"radical addition\"\n-> CCCC(CC{CO2Bu})N({Bn})[CH]c1ccccc1 (Int-V), _\"1,5-HAT\"\n-> CCCC(CC{CO2Bu})N({Bn})Cc1ccccc1 (5a), 4a′, _\"HAT\"",
  "trowbridge2018-fig3b-d4": "butyraldehyde (1a) + C=CC(=O){OBu} (3a) -> CCCC(CC([2H]){CO2Bu})N(C([2H]){Ph})C([2H])([2H]){Ph} (d4-5a), 1 mol% Ir(ppy)3, ^40 W blue LED, 4a, 20 mol% propionic acid, \"4 Å mol. sieves, RT, CH2Cl2, 2 h\", _@[2H]C([2H])(NC([2H])([2H])c1ccccc1)c1ccccc1, 67%",
  "trowbridge2018-fig2b-5aq": "dibenzylamine (2a) + C=C1N({Cbz})[C@H]({tBu})OC1=O -> O=C1O[C@@H]({tBu})N({Cbz})[C@H]1CCN({Bn}){Bn} (5aq), (CH2O)n (5 equiv), methoxyethyl Hantzsch ester (1.5 equiv), Ir(ppy)3 (1 mol%), EtCO2H (20 mol%), CH2Cl2, RT, 2 h, _\"4 Å mol. sieves, 40 W blue LED\", 56%, >20:1 d.r.",
  "trowbridge2018-fig4a-amines": "CCCC(CC({Ph}){Ph})N1CCC(CC1){R}:\n#\nR=Ph (7a) 51% | R=CF3 (7b) 54% | CCCC(CC({Ph}){Ph})N1CCN(CC1){Boc} (7c) 38% | CCCC(CC({Ph}){Ph})N1C[C@@H](C)O[C@@H](C)C1 (7d) 60% | CCCC(CC({Ph}){Ph})N1C[C@H]2C[C@H]2C1 (7e) 25% | CCCC(CC({Ph}){Ph})N1C[C@H]2C[C@@H](C1)c1ccccc12 (7f) 38%\nCCCC(CC({Ph}){Ph})N1[C@H]2CC[C@@H]1CC(=O)C2 (7g) 34% | CCCC(CC({Ph}){Ph})N1CC({OMe})C1 (7h) 81% | CCCC(CC({Ph}){Ph})N(CC)C1CCCCC1 (7i) 69% | CCCC(CC({Ph}){Ph})N(C)CC{OMe} (7j) 86% | CCCC(CC({Ph}){Ph})N(C)C (7k) 88% | CC1(C)CCCC(C)(C)N1CC[C@@H]1N({Cbz})[C@H]({tBu})OC1=O (7l) 61% (>20:1 d.r.)",
  "trowbridge2018-fig4b-10a": "pyrrolidine + cyclohexanone -> 1-(cyclohex-1-en-1-yl)pyrrolidine\n-> C1CCN(C1)C1(CC({Ph}){Ph})CCCCC1 (10a), Ph2C=CH2 (2 equiv), Hantzsch ester 4a, Ir(ppy)3 (1 mol%), EtCO2H (20 mol%), CH2Cl2, RT, 2 h, _\"4 Å mol. sieves, 40 W blue LED\", 53%",
  "trowbridge2018-fig4c-drugs": "Fc1ccc(cc1)[C@@H]1CCN(C[C@H]1COc1ccc2OCOc2c1)C(CCC)CC(c1ccccc1)c1ccccc1 (11)\nClc1ccc2C(=C3CCN(CC3)CC[C@@H]3N({Cbz})[C@H]({tBu})OC3=O)c3ncccc3CCc2c1 (12)\nClc1ccc2Oc3ccccc3N=C(N3CCN(CC3)C(C3CC(F)(F)C3)C[C@@H]3N({Cbz})[C@H]({tBu})OC3=O)c2c1 (13)\nOC(=O)C1=CN(C2CC2)c2cc(N3CCN(CC3)C(CCC(=O)OC)C[C@@H]3N({Cbz})[C@H]({tBu})OC3=O)c(F)cc2C1=O (14)",
  "zu2025-fig2a": "{Ph}NCCCC{Ph} (1) + {MeO}c1ccc(Br)cc1 (2) -> {OMe}c1ccc(cc1)[C@H](CCC{Ph})N{Ph} (3a) + {OMe}c1ccc(cc1)N({Ph})CCCC{Ph} (3b), 3.0 equiv. K3PO4, 10% NiBr2·glyme, 13% (R)-L, 13% PC4, DME, −10 °C, 36 h, _\"390-nm LEDs (40 W)\", 82%, 95% e.e.",
  "zu2025-fig2b": "{R}c1cc({R})cc({R})c1C(=O)c1ccccc1:\n#\nbenzophenone (PC1) 23% yield, 95% e.e. | 2-methylbenzophenone (PC2) 34% yield, 95% e.e. | R=Me (PC3) 76% yield, 94% e.e. | R=iPr (PC4) 82% yield, 95% e.e.",
  "zu2025-fig2c": "{nPr}C({nPr})[C@@H]1CN(c2cccc({tBu})c2)C(=N1)C1=N[C@@H](CN1c1cccc({tBu})c1)C({nPr}){nPr} ((R)-L)",
  "zu2025-table1": "{NHBoc}c1ccc(cc1)[C@H](C)N{Ph} (4)\n{NHBoc}c1ccc(cc1)[C@H](CCC)N{Ph} (5)\n{NHBoc}c1ccc(cc1)[C@H]({R})N{Ph}:\nR=C11H23 (6)\nR=Cy (7)\n{NHBoc}c1ccc(cc1)[C@H](CC({Ph}){Ph})N{Ph} (8)\n{NHBoc}c1ccc(cc1)[C@H](CC{CF3})N{Ph} (9)\n{NHBoc}c1ccc(cc1)[C@H](C{CN})N{Ph} (10)\n{NHBoc}c1ccc(cc1)[C@H](CC(=O){OMe})N{Ph} (11)\n{NHBoc}c1ccc(cc1)[C@H](CCC)Nc1ccccc1{iPr} (12)\n{NHBoc}c1ccc(cc1)[C@H](CCC)Nc1cccc({OMe})c1 (13)\n{NHBoc}c1ccc(cc1)[C@H](CCC)Nc1ccc({CO2Et})cc1 (14)\n{CO2Me}c1ccc(cc1)[C@H](CCC)Nc1ccccc1{OMe} (15)\nc1ccccc1[C@@H]1CCCN1{Ph} (16)\n{NHBoc}c1ccc(cc1)[C@@H]1CCCN1{Ph} (17)\n{CO2Me}c1ccc(cc1)[C@@H]1CCCN1{Ph} (18)\n{NHBoc}c1ccc(cc1)[C@@H]1CCCCN1{Ph} (19)\n{NHBoc}c1ccc(cc1)[C@@H]1CCCCCN1{Ph} (20)",
  "zu2025-fig3a": "CC(C)CNc1ccc(cc1)C(=O)NCCC(=O)OC (79) + 2-(4-bromophenyl)-5-phenyl-1,3,4-oxadiazole -> CC(C)[C@H](Nc1ccc(cc1)C(=O)NCCC(=O)O)c1ccc(cc1)-c1nnc(o1)-c1ccccc1 (81), 1. NiBr2·glyme, (R)-L, PC4, 390-nm LEDs 2. LiOH, 63% over 2 steps, 85% e.e.",
  "zu2025-fig3b": "{CO2Et}[C@@H]1CCCN(C1)C(=O)c1ccc(NCC2CCCCC2)cc1 (84) + 4-bromo-4'-chlorobiphenyl -> {CO2Et}[C@@H]1CCCN(C1)C(=O)c1ccc(N[C@@H](C2CCCCC2)c2ccc(cc2)-c2ccc(Cl)cc2)cc1 (85), \"NiBr2·glyme, (R)-L1, PC4\", _\"390-nm LEDs\", 73%, 98:2 d.r.",
  "zu2025-fig3c": "4'-(tert-butyl)-N-isopentyl-[1,1'-biphenyl]-4-amine (87) + methyl 3-(4-bromobenzamido)propanoate -> CC(C)C[C@H](Nc1ccc(cc1)-c1ccc(cc1)C(C)(C)C)c1ccc(cc1)C(=O)NCC{CO2Me} (88), \"NiBr2·glyme, (R)-L, PC4\", _\"390-nm LEDs\", 69%, 96% e.e.",
  "zu2025-fig4a": "{Ph}NCCCC{Ph} (1) + {CO2Me}c1ccc(Br)cc1 -> FC(F)=C(CC(CCC{Ph})N{Ph}){Ph} (113) + {CO2Me}c1ccc(cc1)[C@H](CCC{Ph})N{Ph} (50), @(3,3,3-trifluoroprop-1-en-2-yl)benzene, 1.0 equiv. olefin added, _\"optimized conditions\", _\"113: 52%, racemic; 50: 10%, 86% e.e.\"",
  "zu2025-fig4b": "{Ph}NCCCC{Ph} (1) + {nPr}C({nPr})[C@@H]1CN(c2cccc({tBu})c2)C3=[N]1[Ni](Br)(c1ccc(cc1)C(=O)NC)[N]1=C3N(C[C@H]1C({nPr}){nPr})c1cccc({tBu})c1 (C) -> {CONHMe}c1ccc(cc1)[C@H](CCC{Ph})N{Ph} (46), 1.0 equiv. PC4, 3.0 equiv. K3PO4, _\"DME, −10 °C, 12 h\", _\"390-nm LEDs (40 W)\", 31%, 90% e.e.",
  "zu2025-fig4d": "{L}[Ni]Br (A) -> {L}[Ni](Br)(Br){Ar} (B), +ArBr, \"Oxidative\\naddition\" -> {L}[Ni](Br){Ar} (C), +PC•−, -PC + Br−, SET -> {L}[Ni](Br)({Ar})C({Alkyl})N{Ph} (D), +PhNHCH(•)Alkyl, \"Radical\\nmetallation\" -> A, -PhNHCH(Ar)Alkyl, \"Reductive\\nelimination\"",
  "taxol-route": "# Scheme 1. The C-ring aldehyde 7\nCCO[C:9](=O)[C@@]3([C@H:7](C=[CH:5][C@:4]([C@H]3[CH2:2]O%10)([C:20]%10=[O:21])O)O)C (2) -> 2[7:OTBS; 4:OTBS; reduce 9] (3), a) TBSOTf, 2,6-lutidine b) LiAlH4, Et2O, 0 °C, _\"a) 95%; b) 94%\"\n-> 3[7:OBn; 9:OTBDPS] (4), c) CSA, MeOH; then TBDPSCl, imidazole, DMF d) KH, BnBr, n-Bu4NI, _\"c) 90%, 92%; d) 87%\"\n-> 4[reduce 20; 4:OH] (5), LiAlH4, Et2O, 25 °C, 80%\n-> 5[protect 4-20 acetonide] (6), Me2C(OMe)2, CSA, CH2Cl2, 82%\n-> 6[2:=O] (7), TPAP, NMO, MeCN, 95%\n# Scheme 2. The ABC ring system 13\nCC1=C([CH2:10]{OTBS})C(C)(C)[C:1](=NNS(=O)(=O)c2c(C(C)C)cc(C(C)C)cc2C(C)C)[CH2:14]C1 (8) + 7 -> 7[2:OH; join 2-1 8 (2S); 1:H; 1=14] (9), n-BuLi, ^THF, ^−78 → 25 °C; ^then 7, 82% (Shapiro)\n-> 9[epoxidise 1-14 (1S)] (10), VO(acac)2, t-BuOOH, _PhH, 87%\n-> 10[open_epoxide 14] (11), LiAlH4, Et2O, 76%\n-> 11[form_carbonate 1-2; 9:=O; 10:=O] (12), d) KH, COCl2, HMPA e) TBAF, THF f) TPAP, NMO, 48%, 80%, 82%\n-> 12[9:OH; 10:OH; close 9-10 (10R)] (13), (TiCl3)2(DME)3, Zn–Cu, ^DME, ^70 °C, 23% (McMurry)\n# Scheme 3. Taxol (1) from 13\n13 -> 13[10:OAc; 9:=O] (14), a) Ac2O, DMAP b) TPAP, NMO, 95%, 93%\n-> 14[hydroborate 5 S; deprotect acetonide] (15), c) BH3·THF; H2O2 d) HCl, MeOH, 55%, 80%\n-> 15[20:OAc] (16), Ac2O, DMAP, CH2Cl2, 95%\n-> 16[OBn>OTES; 20:OH] (17), f) H2, Pd(OH)2/C g) TESCl, pyridine h) K2CO3, MeOH, 97%, 85%, 95%\n-> 17[5:H; close 5-21 (5R)] (18), i) TMSCl, pyridine j) Tf2O, i-Pr2NEt k) CSA, MeOH; SiO2, 96%, 70%, 60%\n-> 18[4:OAc] (19), Ac2O, DMAP, CH2Cl2, 94%\n-> CC1=C2[C@H](C(=O)[C@@]3([C@H](C[C@@H]4[C@]([C@H]3[C@@H]([C@@](C2(C)C)(C[C@@H]1OC(=O)[C@@H]([C@H](c5ccccc5)NC(=O)c6ccccc6)O)O){OBz})(CO4){OAc})O)C){OAc} (1), 1) PhLi; 2) PCC; 3) NaBH4; 4) NaHMDS, 20; 5) HF·py, 80%, 75%, 83%, 87%, 80%",
};
const here = new URL("../scripts/mcp-bench/", import.meta.url), jobs = new Map<string, { tool: string; arguments: unknown }>();
for (const f of readdirSync(new URL("corpus/", here)).filter((x) => x.endsWith(".json"))) for (const j of JSON.parse(readFileSync(new URL(`corpus/${f}`, here), "utf8")).jobs) jobs.set(j.id, j);
// The taxol route (taxol/route.json) as the drawing code draws it: each scheme's title, then the scheme.
const route = JSON.parse(readFileSync(new URL("taxol/route.json", here), "utf8"));
jobs.set("taxol-route", { tool: "change", arguments: { operations: route.schemes.flatMap((s: { title: string; start: unknown; steps: unknown }) => [{ op: "text", text: s.title }, { op: "draw", kind: "reaction", start: s.start, steps: s.steps }]) } });
assert.deepEqual([...jobs.keys()].sort(), Object.keys(NOTES).sort());
let json = 0, lines = 0;
const table: string[] = [], wanted = new Map<string, Awaited<ReturnType<typeof shown>>>();
for (const [id, text] of Object.entries(NOTES)) {
  const j = jobs.get(id)!, r = fromLines({ lines: text });
  assert.ok(typeof r !== "string", `${id}: ${r}`);
  wanted.set(id, await shown(j.tool, j.arguments));
  assert.deepEqual(await shown(...callOf(r)), wanted.get(id), id);
  const a = JSON.stringify(j.arguments).length;
  json += a; lines += text.length;
  table.push(`| ${id} | ${a} | ${text.length} |`);
}
console.log(`| Job | JSON | Notation |\n|---|---|---|\n${table.join("\n")}\n| All ${table.length} | ${json} | ${lines} |`);
// The notation is little more than half the JSON.
assert.ok(lines < 0.6 * json, `${lines} of ${json}`);
// The same jobs with no ^, _ or "..." (a model that leaves the sides to Octet): the jobs whose arrows then have the
// words and structures over and under them that the paper has.
{
  const bare = (t: string) => t.replace(/(^|[\s,;])[\^_](?=\S)/g, "$1").replace(/"/g, "");
  let arrows = 0, same = 0;
  const differ: string[] = [];
  for (const [id, text] of Object.entries(NOTES)) {
    const want = wanted.get(id)!;
    if (!("arrows" in want) || !want.arrows.length || bare(text) === text) { if ("arrows" in want && want.arrows.length) { arrows++; same++; } continue; }
    arrows++;
    const r = fromLines({ lines: bare(text) }), got = typeof r === "string" ? { refused: r } : await shown(...callOf(r));
    if ("arrows" in got && JSON.stringify(got.arrows) === JSON.stringify(want.arrows)) same++;
    else differ.push(`${id}: ${"arrows" in got ? got.arrows.filter((a) => !want.arrows.includes(a)).join(" / ") : got.refused}`);
  }
  console.log(`With no ^, _ or "...": ${same} of ${arrows} jobs with arrows have each side as the paper has.\n${differ.join("\n")}`);
  // 8 before light, sieves and a catalyst's loading went under the arrow (11 November 2026).
  assert.ok(same >= 20, `${same}`);
}

// ---- Hard cases: the arguments each must give, or its refusal ----

const R = (start: object[], steps: object[]) => ({ op: "reaction", args: { start, steps } });
const T = (text: string) => ({ text }), B = { text: "B" }, A = [T("A")];
const HARD: [string, object | RegExp][] = [
  // A reactant that is also the solvent: as written, a starting material or a condition. A full stop at the end.
  ["benzoic acid + MeOH -> methyl benzoate (2), H2SO4, reflux, 6 h, 88%.", R([T("benzoic acid"), T("MeOH")], [{ reagents: ["H2SO4"], temperature: "reflux", time: "6 h", yield: "88%", products: [{ text: "methyl benzoate", number: "2" }] }])],
  ["benzoic acid -> methyl benzoate, MeOH, H2SO4 (cat.), reflux", R([T("benzoic acid")], [{ solvents: ["MeOH"], catalysts: ["H2SO4 (cat.)"], temperature: "reflux", products: [T("methyl benzoate")] }])],
  // A comma with no space is part of a name (2,6-lutidine, (1S,2R), N,N-); r.t. is a temperature and keeps its stop.
  ["A -> B, TBSOTf, 2,6-lutidine, CH2Cl2, r.t.", R(A, [{ reagents: ["TBSOTf", "2,6-lutidine"], solvents: ["CH2Cl2"], temperature: "r.t.", products: [B] }])],
  ["(1S,2R)-2-amino-1,2-diphenylethan-1-ol + N,N-dimethylformamide -> X", R([T("(1S,2R)-2-amino-1,2-diphenylethan-1-ol"), T("N,N-dimethylformamide")], [{ products: [T("X")] }])],
  // A + in brackets or at the end of a word is a charge.
  ["Na+ + Cl− -> NaCl", R([T("Na+"), T("Cl−")], [{ products: [T("NaCl")] }])],
  ["C[N+](C)(C)C.[OH-] + CC=O -> Y", R([T("C[N+](C)(C)C.[OH-]"), T("CC=O")], [{ products: [T("Y")] }])],
  // Arrows, Unicode or ASCII, with any spacing; >> as reaction SMILES write it.
  ["A → B", R(A, [{ products: [B] }])],
  ["A⇌B", R(A, [{ arrow: "equilibrium", products: [B] }])],
  ["A => B + C", R(A, [{ arrow: "retro", products: [B, T("C")] }])],
  ["A <-> B", R(A, [{ arrow: "resonance", products: [B] }])],
  ["A -/-> B", R(A, [{ arrow: "nogo", products: [B] }])],
  ["A↛B", R(A, [{ arrow: "nogo", products: [B] }])],
  ["A.B>>C", R([T("A.B")], [{ products: [T("C")] }])],
  ["  A   ->B ,  H2SO4 ;  reflux  ", R(A, [{ reagents: ["H2SO4"], temperature: "reflux", products: [B] }])],
  // A number in either bracket, or bold; a caption after it, or in quotes; an amount in brackets is a caption.
  ["A -> B [3]", R(A, [{ products: [{ text: "B", number: "3" }] }])],
  ["A -> B **3**", R(A, [{ products: [{ text: "B", number: "3" }] }])],
  ['A -> B (3) "crude"', R(A, [{ products: [{ text: "B", number: "3", caption: "crude" }] }])],
  ["A -> B (4g) 85%", R(A, [{ products: [{ text: "B", number: "4g", caption: "85%" }] }])],
  ["A -> B (1, 95%), X (1.2 equiv, 3 mmol)", R(A, [{ reagents: ["X (1.2 equiv, 3 mmol)"], products: [{ text: "B", number: "1", caption: "95%" }] }])],
  ["A + B (1.2 equiv) -> C, Et3N (1.5 equiv), 80 ºC", R([T("A"), { text: "B", caption: "(1.2 equiv)" }], [{ reagents: ["Et3N (1.5 equiv)"], temperature: "80 °C", products: [T("C")] }])],
  // Brackets in a name are not a number.
  ["methyl (S)-lactate + tetrakis(triphenylphosphine)palladium(0) -> X", R([T("methyl (S)-lactate"), T("tetrakis(triphenylphosphine)palladium(0)")], [{ products: [T("X")] }])],
  // then, and numbered operations, with no decision by the model.
  ["A -> B, (COCl)2, DMSO, CH2Cl2, −78 °C; then Et3N, 90%", R(A, [{ reagents: ["(COCl)2"], solvents: ["DMSO", "CH2Cl2"], temperature: "−78 °C", yield: "90%", below: ["then Et3N"], products: [B] }])],
  ["A -> B, 1. n-BuLi, THF, −78 °C 2. DMF, 85%", R(A, [{ yield: "85%", above: ["1. n-BuLi, THF, −78 °C", "2. DMF"], products: [B] }])],
  ["A -> B, (i) NaH, THF (ii) MeI, 80%", R(A, [{ yield: "80%", above: ["(i) NaH, THF", "(ii) MeI"], products: [B] }])],
  ["A -> B, 1. X, 78% 2. Y, 42%", R(A, [{ above: ["1. X, 78%", "2. Y, 42%"], products: [B] }])],
  ["A -> B, a) X b) Y, _\"a) 95%; b) 94%\"", R(A, [{ above: ["a) X", "b) Y"], below: ["a) 95%; b) 94%"], products: [B] }])],
  // A temperature range is not an arrow.
  ["A -> B, n-BuLi, THF, −78 → 25 °C, 3 h", R(A, [{ reagents: ["n-BuLi"], solvents: ["THF"], temperature: "−78 → 25 °C", time: "3 h", products: [B] }])],
  // Marks: ^ over, _ under, "..." as written (arrows and commas in it too), @ a structure.
  ['A -> B, ^THF, _H2SO4, "two steps -> one", @L-proline, _@NFSI (5)', R(A, [{ above: ["THF", "two steps -> one", T("L-proline")], below: ["H2SO4", { text: "NFSI", number: "5" }], products: [B] }])],
  // A line goes on from the last product: with an arrow, or with the product's number. Several steps on one line.
  ["A -> B (2)\n-> C (3), NaBH4", R(A, [{ products: [{ text: "B", number: "2" }] }, { reagents: ["NaBH4"], products: [{ text: "C", number: "3" }] }])],
  ["A -> B (2)\n2 -> C (3), NaBH4", R(A, [{ products: [{ text: "B", number: "2" }] }, { reagents: ["NaBH4"], products: [{ text: "C", number: "3" }] }])],
  ["A -> B (2), X -> C (3), Y", R(A, [{ reagents: ["X"], products: [{ text: "B", number: "2" }] }, { reagents: ["Y"], products: [{ text: "C", number: "3" }] }])],
  // Changes to an earlier compound (compound.ts), and [...] alone for the one before.
  ["2[7:OTBS; 4:OTBS; reduce 9] (3)", { op: "structures", args: { structures: [{ from: "2", changes: [{ at: "7", set: "OTBS" }, { at: "4", set: "OTBS" }, { do: "reduce", at: "9" }], number: "3" }] } }],
  ["7[2:OH; join 2-1 8 (2S); 1:H; 1=14] (9)", { op: "structures", args: { structures: [{ from: "7", changes: [{ at: "2", set: "OH" }, { do: "join", at: "2-1", with: "8", config: { 2: "S" } }, { at: "1", remove: true }, { bond: "1-14", to: "double" }], number: "9" }] } }],
  ["14[hydroborate 5 S, deprotect acetonide, 7:OBn>OTES]", { op: "structures", args: { structures: [{ from: "14", changes: [{ do: "hydroborate", at: "5", config: "S" }, { do: "deprotect", with: "acetonide" }, { swap: { OBn: "OTES" }, at: "7" }] }] } }],
  ["3[2nd OBn>OTES; 7+OH; 5#6; oxidize 7; open epoxide 14; close 9-10 double (1S,2R)] (4)", { op: "structures", args: { structures: [{ from: "3", changes: [{ swap: { OBn: "OTES" }, occurrence: 2 }, { at: "7", add: "OH" }, { bond: "5-6", to: "triple" }, { do: "oxidise", at: "7" }, { do: "open_epoxide", at: "14" }, { do: "close", at: "9-10", to: "double", config: { 1: "S", 2: "R" } }], number: "4" }] } }],
  ["A (1) -> [OMe>OH] (2), BBr3", R([{ text: "A", number: "1" }], [{ reagents: ["BBr3"], products: [{ from: "1", changes: [{ swap: { OMe: "OH" } }], number: "2" }] }])],
  // {R} is a label; a * with none is refused.
  ["{R}c1ccccc1 + {Ar}B(O)O -> {R}c1ccc({Ar})cc1", R([{ text: "*c1ccccc1", labels: ["R"] }, { text: "*B(O)O", labels: ["Ar"] }], [{ products: [{ text: "*c1ccc(*)cc1", labels: ["R", "Ar"] }] }])],
  ["*c1ccccc1{R}", /has a \* with no label: write each as \{R\}/],
  // A chain back to its first compound is a cycle; # before it is its centre.
  ["# L = PPh3\n{L}[Pd]{L} (A) -> {L}[Pd]({L})(Br){Ar} (B), +ArBr, OA -> {L}[Pd]({L})({Ar}){Ar} (C), +ArB(OH)2, -B(OH)2Br, TM -> A, -Ar–Ar, RE", { op: "cycle", args: { intermediates: [{ text: "*[Pd]*", labels: ["L", "L"], number: "A" }, { text: "*[Pd](*)(Br)*", labels: ["L", "L", "Ar"], number: "B" }, { text: "*[Pd](*)(*)*", labels: ["L", "L", "Ar", "Ar"], number: "C" }], centre: "L = PPh3", steps: [{ step: 0, in: "ArBr", name: "OA" }, { step: 1, in: "ArB(OH)2", out: "B(OH)2Br", name: "TM" }, { step: 2, out: "Ar–Ar", name: "RE" }] } }],
  // A scope: the core once, then one line a compound. | puts compounds in one row.
  ["{R}c1ccc(cc1)C(C)=O:\nR=OMe (3a) 91%\nR=F (3b) 85% | R=CF3 (3c)", { op: "structures", args: { structures: [{ text: "*c1ccc(cc1)C(C)=O", labels: ["OMe"], number: "3a", caption: "91%" }, { text: "*c1ccc(cc1)C(C)=O", labels: ["F"], number: "3b", caption: "85%" }, { text: "*c1ccc(cc1)C(C)=O", labels: ["CF3"], number: "3c" }], columns: 2 } }],
  ["core: {R}c1ccc(cc1)C(C)=O\nR = OMe (3a, 91%)", { op: "structures", args: { structures: [{ text: "*c1ccc(cc1)C(C)=O", labels: ["OMe"], number: "3a", caption: "91%" }] } }],
  // A Markdown code fence round the lines is taken off.
  ["```text\nA -> B\n```", R(A, [{ products: [B] }])],
  // A title makes a figure; ## its subtitle; "..." a text item.
  ['# Catalysts\n## Scheme 2\nL-proline (1) | "and" | (S)-proline (2) 51%\\nhomo', { op: "figure", args: { panels: [{ title: "Catalysts", subtitle: "Scheme 2", rows: [[{ structure: "L-proline", number: "1" }, { text: "and" }, { structure: "(S)-proline", number: "2", caption: "51%\nhomo" }]] }] } }],
  // A route: schemes with titles, an earlier compound by its number. The rest of the call's arguments go with it.
  ["# Scheme 1. Oxidation\ntoluene -> benzoic acid (1), KMnO4, 70%\n# Scheme 2\n1 -> benzoyl chloride (2), SOCl2", { op: "batch", args: { steps: [{ tool: "text", args: { text: "Scheme 1. Oxidation" } }, { tool: "reaction", args: { start: [T("toluene")], steps: [{ reagents: ["KMnO4"], yield: "70%", products: [{ text: "benzoic acid", number: "1" }] }] } }, { tool: "text", args: { text: "Scheme 2" } }, { tool: "reaction", args: { start: [{ from: "1", number: "1" }], steps: [{ reagents: ["SOCl2"], products: [{ text: "benzoyl chloride", number: "2" }] }] } }] } }],
  // Refused, with what to write instead: two readings, nothing to go on from, an open bracket, a dative bond.
  ["A, B -> C", /reads two ways: starting materials \(write them with \+\), or a compound and its conditions/],
  ["-> B", /starts with an arrow, but there is no compound before it/],
  ["A -> B (", /a bracket is not closed/],
  ["A ->", /an arrow has no product after it/],
  ["[NH3]->[Pt]", /reads as a dative bond in a SMILES or as an arrow/],
  ["3[reduce 7 9]", /reduce has two places \(7, 9\)/],
  ["3[foo bar]", /foo is not a transformation\. They are: protect, deprotect/],
  ["3[7=OTBS]", /cannot read the change "7=OTBS"/],
  ["", /nothing to draw/],
  // A SMILES of one bracket atom is a SMILES: a change is only one compound.ts knows.
  ["anisole (1) -> [Pd] (2)", R([{ text: "anisole", number: "1" }], [{ products: [{ text: "[Pd]", number: "2" }] }])],
  ["[Li] + A -> B", R([T("[Li]"), T("A")], [{ products: [B] }])],
  ["A (1) -> [Cu] (2)", R([{ text: "A", number: "1" }], [{ products: [{ text: "[Cu]", number: "2" }] }])],
  ["A -> B, @[Pd]", R(A, [{ above: [T("[Pd]")], products: [B] }])],
  ["PhBr (1)\n[Mg]", { op: "structures", args: { structures: [{ text: "PhBr", number: "1" }, T("[Mg]")] } }],
  // (R) after a name is a number or a configuration; [R] is a number.
  ["2-butanone -> 2-butanol (R), NaBH4", /"2-butanol \(R\)" reads two ways: \(R\) is compound R \(write \[R\]\), or a configuration \(write \(R\)-2-butanol\)/],
  ["A -> B (2S)", /reads two ways: \(2S\) is compound 2S/],
  ["A -> B [R]", R(A, [{ products: [{ text: "B", number: "R" }] }])],
  // A number given earlier that is also a SMILES; **C** is the compound.
  ["X (C) -> Y (D)\nC + O -> CO", /"C" reads two ways: compound C \(write \*\*C\*\*\), or the structure C/],
  ["X (C) -> Y (D)\n**C** + O -> CO", { op: "batch", args: { steps: [{ tool: "reaction", args: { start: [{ text: "X", number: "C" }], steps: [{ products: [{ text: "Y", number: "D" }] }] } }, { tool: "reaction", args: { start: [{ from: "C", number: "C" }, T("O")], steps: [{ products: [T("CO")] }] } }] } }],
  // Back to the first compound with no +x, -x or title: a cycle or a scheme. A yield makes it a scheme.
  ["benzyl alcohol (1) -> 1[OH>OTBS] (2), TBSCl, imidazole, DMF -> 1, TBAF, THF", /the steps come back to 1, so they read two ways: a catalytic cycle \(write \+x for what goes in, -x for what comes out\) or a scheme/],
  ["A (1) -> B (2), X, 90% -> 1, Y, 80%", R([{ text: "A", number: "1" }], [{ reagents: ["X"], yield: "90%", products: [{ text: "B", number: "2" }] }, { reagents: ["Y"], yield: "80%", products: [{ from: "1", number: "1" }] }])],
  // A scope's groups split as conditions do: 2,4-Cl2C6H3 is one group; a space before NAME= starts the next.
  ["{Ar}C(C)=O:\nAr=2,4-Cl2C6H3 (1) 90%", { op: "structures", args: { structures: [{ text: "*C(C)=O", labels: ["2,4-Cl2C6H3"], number: "1", caption: "90%" }] } }],
  ["{R}c1ccc({Ar})cc1:\nR=Me, Ar=3,5-(CF3)2C6H3 (2) | R=Et Ar=Ph (3)", { op: "structures", args: { structures: [{ text: "*c1ccc(*)cc1", labels: ["Me", "3,5-(CF3)2C6H3"], number: "2" }, { text: "*c1ccc(*)cc1", labels: ["Et", "Ph"], number: "3" }], columns: 2 } }],
  // A reagent in its solvent goes over the arrow; a mixture of solvents under it.
  ["A -> B, HCl/dioxane, NaOMe/MeOH, THF/H2O (4:1)", R(A, [{ reagents: ["HCl/dioxane", "NaOMe/MeOH"], solvents: ["THF/H2O (4:1)"], products: [B] }])],
  // A yield or ratio with its word first.
  ["A -> B, yield 88%, E:Z >95:5, d.r. 10:1", R(A, [{ yield: "yield 88%, E:Z >95:5, d.r. 10:1", products: [B] }])],
  // Arrows that autocorrect makes; a reaction SMILES with agents.
  ["A —> B", R(A, [{ products: [B] }])],
  ["A –> B", R(A, [{ products: [B] }])],
  ["CCO>[H+]>CC=O", /reaction SMILES with agents: write CCO -> CC=O, \[H\+\]/],
  // A comma with no space that is not between locants.
  ["A -> B,X", /"B,X": put a space after the comma before X/],
  ["4,4'-dimethoxy-1,1'-biphenyl + N,N-diethyl-2,6-xylidine -> X", R([T("4,4'-dimethoxy-1,1'-biphenyl"), T("N,N-diethyl-2,6-xylidine")], [{ products: [T("X")] }])],
  // Operations that skip a number.
  ["A -> B, 1. X 3. Y", /operation 3 follows 1: number them in order/],
];
for (const [text, want] of HARD) {
  const got = fromLines({ lines: text });
  if (want instanceof RegExp) assert.match(String(got), want, text);
  else assert.deepEqual(got, want, text);
}
// The call's other arguments go with the lines; kind is refused when it is not what the lines draw.
assert.deepEqual(fromLines({ lines: "A -> B", below: "s3", picture: true }), { op: "reaction", args: { start: A, steps: [{ products: [B] }], below: "s3", picture: true } });
assert.match(String(fromLines({ lines: "A -> B", kind: "cycle" })), /kind does not go with lines, which draw a reaction/);
assert.deepEqual(fromLines({ lines: "A -> B", kind: "reaction" }), { op: "reaction", args: { start: A, steps: [{ products: [B] }] } });
// Several drawings take what the reply is to have, and nothing that places one drawing.
assert.deepEqual(fromLines({ lines: "# S\nA -> B", picture: true }), { op: "batch", args: { steps: [{ tool: "text", args: { text: "S" } }, { tool: "reaction", args: { start: A, steps: [{ products: [B] }] } }], picture: true } });
assert.match(String(fromLines({ lines: "# S\nA -> B", columns: 2 })), /columns goes with one drawing, and these lines make 2: draw them in separate calls, or leave columns out/);

// ---- Speed, and hostile text ----

// The largest job (the taxol route, 20 lines of up to 230 characters) many times: far under a millisecond a line
// (about 0.05 ms with nothing else running).
{
  const text = NOTES["taxol-route"], n = text.split("\n").length, t = performance.now();
  for (let k = 0; k < 200; k++) fromLines({ lines: text });
  const ms = (performance.now() - t) / 200 / n;
  console.log(`Reading the taxol route: ${(ms * 1000).toFixed(1)} µs a line.`);
  assert.ok(ms < 0.25, `${ms} ms a line`);
}
// Each is refused, or read, in under a second (about 0.2 s with nothing else running), with no crash.
for (const [what, text, want] of [
  ["a million characters", "A -> B, ".repeat(125_000), /over 100000/],
  ["deep brackets", `${"(".repeat(49_000)}A${")".repeat(49_000)} -> B`, /./],
  ["unclosed brackets", `A -> ${"(".repeat(99_000)}`, /not closed/],
  ["stray closing brackets", `A -> B, ${"a) ".repeat(30_000)}`, /./],
  ["many arrows", "A -> ".repeat(19_000) + "B", /./],
  ["many ranges", `A -> B, ${"−78 → 25 °C, ".repeat(7_000)}`, /./],
  ["many separators", `A -> B${", ;".repeat(30_000)}`, /./],
  ["many plus signs", `${"A + ".repeat(24_000)}B -> C`, /./],
  ["many numbers", `A -> B ${"(1) ".repeat(24_000)}`, /./],
  ["a lone surrogate", "A -> B\ud800C", /U\+D800/],
  ["a lone low surrogate", "\udc00A -> B", /U\+DC00/],
  ["control characters", "A -> B\u0000\u001b", /U\+0000/],
  ["many lines", "A -> B\n".repeat(14_000), /./],
] as [string, string, RegExp][]) {
  const t = performance.now(), got = fromLines({ lines: text }), ms = performance.now() - t;
  assert.match(typeof got === "string" ? got : JSON.stringify(got).slice(0, 100), want, what);
  assert.ok(ms < 1000, `${what}: ${Math.round(ms)} ms`);
}
