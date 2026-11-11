// The speed jobs (Sam, 11 November 2026: make Octet's tools faster for AI models): what a drawing job costs the model,
// measured with the lean harness (brief.mjs, call.mjs, judge.mjs; README in brief.mjs). In the cases.mjs form: id,
// prompt, for, setup, check, and brief: the simulated user's answers to Octet's three questions, which brief.mjs puts
// in the user's message. Two kinds:
//   say    the user's message gives everything (names or SMILES, conditions, numbers): only the cost of telling Octet
//   paper  the same drawing jobs as a paper gives them (prose and compound numbers): the model works out the structures
// The chemistry is from the benchmark's corpus (scripts/mcp-bench/corpus, the papers it cites) and the Nicolaou taxol
// route (scripts/mcp-bench/taxol), in our own words. Each check is exact: structures by InChIKey (stereo included),
// and the conditions on the arrow between two structures.
import { readFileSync } from "node:fs";
import { find, is, layout, clean, sub, words } from "./cases.mjs";

const json = (f) => JSON.parse(readFileSync(new URL(f, import.meta.url), "utf8"));
const TAXOL = json("../mcp-bench/taxol/structures.json");
const corpus = (paper, id) => json(`../mcp-bench/corpus/${paper}.json`).jobs.find((j) => j.id === id).expect.smiles;
const SCOPE = corpus("trowbridge2018", "trowbridge2018-fig4a-amines"), PIRIBEDIL = corpus("robinson2026", "robinson2026-fig5a");
const TOSYLATE = "Cc1ccc(cc1)S(=O)(=O)[O-]", KETOL = "C[C@]12CCC(=O)C[C@@]1(O)CCC2=O", TRIKETONE = "CC(=O)CCC1(C)C(=O)CCC1=O";
const CYCLE = { 1: "OC(=O)[C@@H]1CCCN1", 2: "C/C(CCC1(C)C(=O)CCC1=O)=[N+]1\\CCC[C@H]1C([O-])=O", 3: "OC(=O)[C@@H]1CCCN1C(=C)CCC1(C)C(=O)CCC1=O", 4: "C[C@]12CC/C(=[N+]3/CCC[C@H]3C([O-])=O)C[C@@]1(O)CCC2=O" };
const YIELDS = { "7a": "51%", "7b": "54%", "7c": "38%", "7d": "60%", "7e": "25%", "7f": "38%", "7g": "34%", "7h": "81%", "7i": "69%", "7j": "86%", "7k": "88%", "7l": "61%" };

// The simulated user's answers to the brief's three questions.
const QUICK = ["No, I have no preferred style.", "Just a quick look on screen, no page.", "Nothing to emphasise."];

// ---- Checks ----

const flat = (t) => sub(t).toLowerCase().replace(/[\s−–]/g, (c) => (c.trim() ? "-" : ""));
// The arrow from one structure to another (InChIKeys): a step with the first before it and the second after it, and
// each of the words in its text (spaces and case aside).
// A structure drawn twice (the end of one scheme and the start of the next) may be either.
const arrow = (d, from, to, ...want) => {
  const all = (k) => d.structures.filter((s) => s.inchiKey === k).map((s) => s.id), a = all(from), b = all(to);
  const st = d.reactions.flatMap((r) => r.steps.map((s, k) => ({ s, after: r.steps[k + 1]?.before ?? r.products }))).find(({ s, after }) => s.before.some((x) => a.includes(x)) && after.some((x) => b.includes(x)));
  const text = st ? flat([...st.s.above, ...st.s.below].filter((x) => !/^s\d+$/.test(x)).join(" ")) : "";
  return [[!!st, `an arrow from ${a[0] ?? from} to ${b[0] ?? to}`, d.reactions.map((r) => r.steps.map((s) => s.before.join("+")).join(" > ") + ` > ${r.products.join("+")}`).join("; ")], ...(st ? want.map((w) => [text.includes(flat(w)), `${a[0]} to ${b[0]} says ${w}`, text]) : [])];
};
// Each compound by number, with its structure.
const numbered = (d, key, list) => Object.entries(list).flatMap(([n, smiles]) => is(d, key(smiles), `compound ${n}`, { number: n }));
// With the brief's "no page" (Quick start) only overlaps count: there is no page to run off.
const apart = (d) => layout(d)[0];
const told = (d, ...list) => list.map((w) => [flat(words(d)).includes(flat(w)), `the drawing says ${w}`]);

const CHECK = {
  oneStep: ({ d, key }) => [...is(d, key(TRIKETONE), "the triketone", { as: "reactant", number: "1" }), ...is(d, key(KETOL), "the ketol, with its stereocentres", { as: "product", number: "2" }), ...arrow(d, key(TRIKETONE), key(KETOL), "proline", "CHCl3", "99% ee"), clean(d), apart(d)],
  // A salt is one structure (its dotted SMILES) or its cation with the tosylate drawn as a structure of its own: "draw
  // the tosylate with each salt" reads either way.
  threeStep: ({ d, key }) => {
    const k = (s) => (find(d, key(s)) || !s.includes(".") ? key(s) : key(s.split(".")[0])), split = ["12a", "13a"].filter((n) => k(PIRIBEDIL[n]) !== key(PIRIBEDIL[n])).length;
    return [...numbered(d, k, PIRIBEDIL), [d.structures.filter((s) => s.inchiKey === key(TOSYLATE)).length >= split, "a tosylate with each salt drawn as its cation"],
      ...arrow(d, k(PIRIBEDIL["11a"]), k(PIRIBEDIL["12a"])), ...arrow(d, k(PIRIBEDIL["12a"]), k(PIRIBEDIL["13a"]), "9-BBN"), ...arrow(d, k(PIRIBEDIL["13a"]), k(PIRIBEDIL["14a"]), "SPhos", "t-BuOK", "47%"), apart(d)];
  },
  fiveStep: ({ d, key }) => {
    const k = (n) => key(TAXOL[n]);
    return [...numbered(d, key, Object.fromEntries(["2", "3", "4", "5", "6", "7"].map((n) => [n, TAXOL[n]]))),
      ...arrow(d, k(2), k(3), "TBSOTf", "LiAlH4"), ...arrow(d, k(3), k(4), "TBDPSCl", "BnBr"), ...arrow(d, k(4), k(5), "LiAlH4", "80%"),
      ...arrow(d, k(5), k(6), "CSA", "82%"), ...arrow(d, k(6), k(7), "TPAP", "NMO", "95%"), clean(d), apart(d)];
  },
  scope: ({ d, key }) => [...numbered(d, key, SCOPE), ...told(d, ...Object.values(YIELDS), ">20:1"), [d.structures.length === 12, "12 structures", String(d.structures.length)], apart(d)],
  cycle: ({ d, key }) => {
    const c = d.cycles?.[0], ids = Object.values(CYCLE).map((s) => find(d, key(s))?.id);
    return [[d.cycles?.length === 1, "one cycle", String(d.cycles?.length ?? 0)], [!!c && ids.every((id, k) => c.intermediates[k] === id), "the four intermediates in order", JSON.stringify([c?.intermediates, ids])], ...numbered(d, key, CYCLE),
      [!!c?.sides?.some((x) => x.side === "in" && x.step === 0), "the triketone goes in at the first step", JSON.stringify(c?.sides)], [!!c?.sides?.some((x) => x.side === "out" && x.step === 3), "the ketol comes out at the last step", JSON.stringify(c?.sides)], apart(d)];
  },
};

// ---- The jobs ----

const say = (s) => s.replace(/\s+/g, " ").trim();
export const SPEED = [
  // ---- say: the user gives everything ----
  { id: "say-one-step", kind: "say", brief: QUICK, check: CHECK.oneStep,
    prompt: say(`Draw this in Octet. 2-Methyl-2-(3-oxobutyl)cyclopentane-1,3-dione (1) was stirred with L-proline (20 mol%) in CHCl3 at rt to give the
      bicyclic ketol 2, ${KETOL}, in 99% ee.`) },
  { id: "say-three-step", kind: "say", brief: QUICK, check: CHECK.threeStep,
    prompt: say(`Draw this three-step scheme with the compound numbers. Piribedil was N-alkylated with tosylate 11a (${PIRIBEDIL["11a"]}) to give the
      ammonium tosylate 12a (${PIRIBEDIL["12a"]}). Hydroboration with 9-BBN–H gave the borane 13a (${PIRIBEDIL["13a"]}), and SPhos·Pd-G3 with
      t-BuOK then gave 14a (${PIRIBEDIL["14a"]}) in 47% yield.`) },
  { id: "say-five-step", kind: "say", brief: QUICK, check: CHECK.fiveStep,
    prompt: say(`Draw the route to aldehyde 7 as one scheme, with the numbers. Each compound is the one before with one change.
      Diol 2 (${TAXOL[2]}): a) TBSOTf, 2,6-lutidine; b) LiAlH4, Et2O, 0 °C (a) 95%, b) 94%) gave 3 (${TAXOL[3]}).
      c) CSA, MeOH, then TBDPSCl, imidazole, DMF; d) KH, BnBr, n-Bu4NI (c) 90%, 92%; d) 87%) gave 4 (${TAXOL[4]}).
      LiAlH4, Et2O, 25 °C (80%) gave 5 (${TAXOL[5]}). Me2C(OMe)2, CSA, CH2Cl2 (82%) gave the acetonide 6 (${TAXOL[6]}).
      TPAP, NMO, MeCN (95%) gave the aldehyde 7 (${TAXOL[7]}).`) },
  { id: "say-scope", kind: "say", brief: QUICK, check: CHECK.scope,
    prompt: say(`Draw this substrate scope as a grid of numbered products, two rows of six, with each yield under its product.
      ${Object.entries(SCOPE).map(([n, s]) => `${n}: ${s}, ${YIELDS[n]}${n === "7l" ? " (>20:1 d.r.)" : ""}`).join("; ")}.`) },
  { id: "say-cycle", kind: "say", brief: QUICK, check: CHECK.cycle,
    prompt: say(`Draw this catalytic cycle, clockwise, with the four species numbered 1 to 4: L-proline 1 (${CYCLE[1]}), the iminium carboxylate 2
      (${CYCLE[2]}), the enamine 3 (${CYCLE[3]}) and the iminium carboxylate of the ketol 4 (${CYCLE[4]}). The triketone goes in at the first step
      (1 to 2), and the ketol comes out at the last (4 to 1). Write the triketone and the ketol as words on the side arrows.`) },
  { id: "say-two-schemes", kind: "say", brief: QUICK,
    prompt: say(`Draw these two schemes, each with its title above it, and the compound numbers.
      "Scheme 1. The C2 alcohol 15": 13 (${TAXOL[13]}) with a) Ac2O, DMAP; b) TPAP, NMO (95%, 93%) gave 14 (${TAXOL[14]}); c) BH3·THF, then H2O2;
      d) HCl, MeOH (55%, 80%) gave 15 (${TAXOL[15]}).
      "Scheme 2. The TES ether 17": 15 with Ac2O, DMAP, CH2Cl2 (95%) gave 16 (${TAXOL[16]}); f) H2, Pd(OH)2/C; g) TESCl, pyridine; h) K2CO3, MeOH
      (97%, 85%, 95%) gave 17 (${TAXOL[17]}).`),
    check: ({ d, key }) => {
      const k = (n) => key(TAXOL[n]);
      return [...numbered(d, key, Object.fromEntries(["13", "14", "15", "16", "17"].map((n) => [n, TAXOL[n]]))), ...told(d, "Scheme 1. The C2 alcohol 15", "Scheme 2. The TES ether 17"),
        ...arrow(d, k(13), k(14), "Ac2O", "TPAP"), ...arrow(d, k(14), k(15), "BH3", "HCl"), ...arrow(d, k(15), k(16), "Ac2O", "95%"), ...arrow(d, k(16), k(17), "TESCl", "K2CO3"), apart(d)];
    } },
  { id: "say-fix", kind: "say",
    // The ketol drawn as its enantiomer; the user names the one thing to fix.
    setup: [["draw", { kind: "reaction", start: [{ text: TRIKETONE, number: "1" }], steps: [{ catalysts: ["L-proline (20 mol%)"], solvents: ["CHCl3"], temperature: "rt", yield: "99% ee", products: [{ text: "C[C@@]12CCC(=O)C[C@]1(O)CCC2=O", number: "2" }] }] }]],
    prompt: say(`In my open drawing, ketol 2 is the wrong enantiomer. It must be ${KETOL}. Fix only that.`),
    check: ({ d, key }) => [...CHECK.oneStep({ d, key }), layout(d)[1], [!find(d, key("C[C@@]12CCC(=O)C[C@]1(O)CCC2=O")), "the wrong enantiomer is gone"], [d.structures.length === 2, "two structures", String(d.structures.length)]] },
  { id: "say-restyle", kind: "say",
    setup: [["draw", { kind: "reaction", start: [{ text: TRIKETONE, number: "1" }], steps: [{ catalysts: ["L-proline (20 mol%)"], solvents: ["CHCl3"], temperature: "rt", yield: "99% ee", products: [{ text: KETOL, number: "2" }] }] }]],
    prompt: "Restyle my open drawing for Angewandte Chemie.",
    check: ({ d, key }) => [[d.style === "Wiley (Angewandte)", "the style is Wiley (Angewandte)", d.style], ...CHECK.oneStep({ d, key }), layout(d)[1]] },
  { id: "say-question", kind: "say",
    setup: [["draw", { kind: "structures", structures: [{ text: TAXOL[18], number: "18" }, { text: TAXOL[19], number: "19" }] }]],
    prompt: "What is the molecular formula of compound 19 in my open drawing, and how many stereocentres does it have?",
    check: ({ d, answer }) => { const a = sub(answer).replace(/\s/g, ""); return [[a.includes("C31H46O10Si"), "the answer gives C31H46O10Si", answer.slice(0, 200)], [/\b(8|eight)\s+(stereo|chiral)|stereocent\w*\s*[:=]?\s*(8|eight)\b/i.test(answer), "the answer gives 8 stereocentres"], [d.structures.length === 2, "the drawing is as it was", String(d.structures.length)]]; } },

  // ---- paper: the same drawing jobs as a paper gives them; the model works out the structures ----
  { id: "paper-one-step", kind: "paper", brief: QUICK, check: CHECK.oneStep,
    prompt: say(`Draw the Hajos–Parrish cyclisation as the paper reports it: triketone 1 with L-proline (20 mol%) in CHCl3 at rt gives the
      (3aS,7aS)-ketol 2 (99% ee).`) },
  { id: "paper-three-step", kind: "paper", brief: QUICK, check: CHECK.threeStep,
    prompt: say(`Draw this three-step scheme with the paper's numbers. Piribedil is N-alkylated with but-3-en-1-yl tosylate (11a) to give the
      quaternary ammonium tosylate 12a. Hydroboration of its alkene with 9-BBN–H gives the 9-BBN borane 13a (still the ammonium tosylate). With
      SPhos·Pd-G3 and t-BuOK, the benzylic C–N bond is replaced by a bond from the benzylic carbon to the end of the borane's chain, which gives the
      neutral amine 14a (47%). Draw the tosylate counter-ion with each salt.`) },
  { id: "paper-five-step", kind: "paper", brief: QUICK, check: CHECK.fiveStep,
    prompt: say(`Draw Nicolaou's route to the taxol C-ring aldehyde 7 as one scheme, with the numbers. The Diels–Alder adduct 2 is ${TAXOL[2]}.
      a) TBSOTf, 2,6-lutidine (both OH groups become TBS ethers); b) LiAlH4, Et2O, 0 °C (the ethyl ester becomes CH2OH; the lactone stays)
      (a) 95%, b) 94%) give 3. c) CSA, MeOH, then TBDPSCl, imidazole, DMF (the secondary TBS ether comes off, and the CH2OH becomes a TBDPS
      ether); d) KH, BnBr, n-Bu4NI (the free secondary OH becomes a benzyl ether) (c) 90%, 92%; d) 87%) give 4. LiAlH4, Et2O, 25 °C reduces
      the lactone to its diol and takes off the tertiary TBS ether (80%), which gives the triol 5. Me2C(OMe)2, CSA, CH2Cl2 (82%) makes the
      acetonide of the tertiary OH and the CH2OH on the same carbon, which gives 6. TPAP, NMO, MeCN (95%) oxidises the last CH2OH to the
      aldehyde 7. Keep every stereocentre.`) },
  // The names of 7f and 7g give no stereo, and their bridges allow only one: a drawing with it or without it is right.
  { id: "paper-scope", kind: "paper", brief: QUICK, check: ({ d, key, loose }) => CHECK.scope({ d, key: (s) => ([SCOPE["7f"], SCOPE["7g"]].includes(s) ? loose(s) : key(s)) }),
    prompt: say(`Draw the amine scope of this hydroaminoalkylation as a grid of numbered products, two rows of six, with each yield under its
      product. Products 7a to 7k are the tertiary amines R2N–CH(n-Pr)–CH2–CHPh2 from these amines: 7a 4-phenylpiperidine, 51%; 7b
      4-(trifluoromethyl)piperidine, 54%; 7c 1-Boc-piperazine, 38%; 7d cis-2,6-dimethylmorpholine, 60%; 7e 3-azabicyclo[3.1.0]hexane (cis),
      25%; 7f 2,3,4,5-tetrahydro-1H-1,5-methano-3-benzazepine, 38%; 7g nortropinone, 34%; 7h 3-methoxyazetidine, 81%; 7i
      N-ethylcyclohexylamine, 69%; 7j N-(2-methoxyethyl)methylamine, 86%; 7k dimethylamine, 88%. 7l is benzyl
      (2S,4S)-2-tert-butyl-5-oxo-4-[2-(2,2,6,6-tetramethylpiperidin-1-yl)ethyl]-1,3-oxazolidine-3-carboxylate, 61% (>20:1 d.r.).`) },
  { id: "paper-cycle", kind: "paper", brief: QUICK, check: CHECK.cycle,
    prompt: say(`Draw the proline catalytic cycle of the Hajos–Parrish reaction, clockwise, with the species numbered 1 to 4: L-proline (1); the
      iminium carboxylate (2) that proline forms with the side-chain ketone of the triketone (the Z iminium); the enamine (3), drawn as the
      neutral acid with the terminal alkene; and the iminium carboxylate (4) of the cyclised (3aS,7aS)-ketol (the E iminium). The triketone goes in at the first
      step and the ketol comes out at the last. Write the triketone and the ketol as words on the side arrows.`) },
];
