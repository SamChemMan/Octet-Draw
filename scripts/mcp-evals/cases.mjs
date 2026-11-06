// The eval cases (docs/plans/mcp.md, E3): realistic jobs an AI app is given, each with what it must do and a check.
// set: "train" cases are read and tuned against; "held" cases are kept back, run only to see that a change to the
// tool wording holds on jobs it was not tuned on. The procedures are written for these cases (no text from papers).
// Each case:
//   prompt     what the user types in the AI app
//   for        the drawing the case starts in: "paper" (the default) or "experiment"
//   setup      calls made before the AI app starts (a drawing to read or fix), with the case's client
//   picture    a structure or scheme Octet draws first, given to the AI app as a PNG (see run.mjs pictures)
//   want       SMILES Octet turns into InChIKeys before the run, so checks compare structures, not strings
//   check      ({ d, answer, key, loose, answered }) => [[ok, what, found], ...]: d is read_drawing (detail full) at
//              the end, answer the AI app's last text, key(smiles) the InChIKey, loose(smiles) its first block (no
//              stereo), answered the InChIKeys of the SMILES in the answer (answerSmiles: true)

import { readFileSync } from "node:fs";

// ---- Helpers for checks ----

const sub = (t) => t.replace(/[₀-₉]/g, (c) => String(c.charCodeAt(0) - 0x2080));
// A structure by InChIKey (the full key, or the first block when stereo does not matter).
const find = (d, k) => d.structures.find((s) => s.inchiKey === k || s.inchiKey?.split("-")[0] === k);
// Every structure id in a reaction's steps, and its products.
const inReaction = (d, id) => d.reactions.some((r) => r.products.includes(id) || r.steps.some((s) => s.before.includes(id) || s.above.includes(id) || s.below.includes(id)));
const product = (d, id) => d.reactions.some((r) => r.products.includes(id) || r.steps.slice(1).some((s) => s.before.includes(id)));
// All the words in the drawing: captions, conditions, free text and cycle text.
const words = (d) => sub([...(d.captions ?? []).map((c) => c.text), ...d.reactions.flatMap((r) => r.steps.flatMap((s) => [...s.above, ...s.below].filter((x) => typeof x === "string")))].join(" \n ")).toLowerCase();
const says = (d, ...any) => any.some((w) => words(d).includes(w.toLowerCase()));
const steps = (d) => Math.max(0, ...d.reactions.map((r) => r.steps.length));

// Layout, as the acceptance script checks it: boxes that overlap (text and what it belongs to apart) and boxes off the page.
const meets = (p, q) => p && q && p[0] < q[2] - 0.05 && q[0] < p[2] - 0.05 && p[1] < q[3] - 0.05 && q[1] < p[3] - 0.05;
const boxes = (d) => [
  ...d.structures.map((s) => [s.id, s.box]),
  ...(d.captions ?? []).filter((c) => c.box).map((c) => [c.id, c.box, c.of]),
  ...(d.reagentTables ?? []).filter((t) => t.box).map((t) => [`table:${t.arrow}`, t.box, t.arrow]),
  ...d.arrows.filter((a) => !["curved", "fishhook", "arc", "line"].includes(a.kind)).map((a) => [a.id, [Math.min(a.from[0], a.to[0]), Math.min(a.from[1], a.to[1]) - 0.05, Math.max(a.from[0], a.to[0]), Math.max(a.from[1], a.to[1]) + 0.05]]),
];
const layout = (d) => {
  const b = boxes(d), over = [];
  b.forEach(([p, x, ofP], k) => b.slice(k + 1).forEach(([q, y, ofQ]) => { if (ofP !== q && ofQ !== p && meets(x, y)) over.push(`${p}/${q}`); }));
  const pg = d.pageBox, off = pg ? b.filter(([, x]) => x && (x[0] < pg[0] - 1e-6 || x[1] < pg[1] - 1e-6 || x[2] > pg[2] + 1e-6 || x[3] > pg[3] + 1e-6)).map(([p]) => p) : [];
  return [[!over.length, "nothing overlaps", over.slice(0, 6).join(", ")], [!off.length, "everything is on the page", off.join(", ")]];
};
const clean = (d) => [!d.warnings.length, "no warnings", d.warnings.map((w) => w.message).join("; ")];
// A structure that must be there, in a reaction (as a product when asked), with a number when asked.
const is = (d, k, what, { as, number } = {}) => {
  const s = find(d, k), out = [[!!s, `${what} is drawn`, d.structures.map((x) => x.name ?? x.formula).join(", ")]];
  if (s && as === "product") out.push([product(d, s.id), `${what} is a product`]);
  if (s && as === "reactant") out.push([inReaction(d, s.id) && !product(d, s.id), `${what} is a starting material`]);
  if (s && number) out.push([s.number === number, `${what} is numbered ${number}`, s.number ?? "no number"]);
  return out;
};
// Every column of the reagent table has an amount typed (a column without one counts as 1.00 eq, a made-up amount).
const counted = (d) => { const bare = (d.reagentTables?.[0]?.columns ?? []).filter((c) => !c.product && !Object.keys(c.typed ?? {}).length).map((c) => c.what); return [!bare.length, "every column has an amount", bare.join(", ")]; };
const amount = (d, k, field, value) => {
  const cols = d.reagentTables?.[0]?.columns ?? [], s = find(d, k), f = s?.formula;
  const col = cols.find((c) => c.formula === f);
  return [Math.abs((col?.typed?.[field] ?? NaN) - value) < 1e-6, `${f ?? k}: ${field} ${value}`, JSON.stringify(col?.typed)];
};

// ---- SMILES used by the checks ----

const S = {
  benzoicAcid: "OC(=O)c1ccccc1", methylBenzoate: "COC(=O)c1ccccc1",
  bromoanisole: "COc1ccc(Br)cc1", phenylboronic: "OB(O)c1ccccc1", methoxybiphenyl: "COc1ccc(cc1)-c1ccccc1",
  phMgBr: "Br[Mg]c1ccccc1", trityl: "OC(c1ccccc1)(c1ccccc1)c1ccccc1",
  benzylamine: "NCc1ccccc1", bocBenzylamine: "CC(C)(C)OC(=O)NCc1ccccc1",
  cinnamate: "CCOC(=O)/C=C/c1ccccc1",
  benzylCyclohexylamine: "C(NC1CCCCC1)c1ccccc1",
  octanol: "CCCCCCCCO", octanal: "CCCCCCCC=O", decenoate: "CCCCCCC/C=C/C(=O)OC", decanoate: "CCCCCCCCCC(=O)OC",
  norbornene: "O=C1OC(=O)[C@@H]2[C@H]1[C@@H]1C=C[C@H]2C1",
  paracetamol: "CC(=O)Nc1ccc(O)cc1", aminophenol: "Nc1ccc(O)cc1",
  hydroxybenzaldehyde: "O=Cc1ccc(O)cc1", benzyloxybenzaldehyde: "O=Cc1ccc(OCc2ccccc2)cc1",
  caffeine: "Cn1cnc2c1c(=O)n(C)c(=O)n2C", sIbuprofen: "CC(C)Cc1ccc(cc1)[C@H](C)C(O)=O", rIbuprofen: "CC(C)Cc1ccc(cc1)[C@@H](C)C(O)=O",
  menthol: "CC(C)[C@@H]1CC[C@@H](C)C[C@H]1O", tbsEther: "CC(C)(C)[Si](C)(C)OCc1ccccc1",
  tBuOH: "CC(C)(C)O", ethylAcetate: "CCOC(C)=O", propylAcetate: "CCCOC(C)=O",
  aspirin: "CC(=O)Oc1ccccc1C(=O)O", ibuprofen: "CC(C)Cc1ccc(cc1)C(C)C(=O)O",
  amides: ["CC(=O)NCc1ccccc1", "O=C(NCc1ccccc1)c1ccccc1", "CCC(=O)NCc1ccccc1", "CC(C)C(=O)NCc1ccccc1", "O=C(NCc1ccccc1)C1CC1", "CC(C)(C)C(=O)NCc1ccccc1"],
  biaryls: ["COc1ccc(cc1)-c1ccccc1", "COc1ccc(cc1)-c1ccc(F)cc1", "COc1ccc(cc1)-c1cccnc1", "COc1ccc(cc1)-c1cccs1"],
};
export const WANT = [...new Set(Object.values(S).flat())];

const SUZUKI = "4-Bromoanisole (1.87 g, 10.0 mmol), phenylboronic acid (1.46 g, 12.0 mmol), Pd(PPh3)4 (0.35 g, 0.30 mmol) and K2CO3 (2.76 g, 20.0 mmol) in toluene/EtOH/H2O (4:1:1, 30 mL) were stirred at 80 °C under N2 for 12 h. Column chromatography gave 4-methoxybiphenyl as a white solid (1.62 g, 88%).";
const SUZUKI_DRAWN = { start: [{ text: S.bromoanisole }, { text: S.phenylboronic }], steps: [{ reagents: ["K2CO3"], catalysts: ["Pd(PPh3)4"], solvents: ["toluene/EtOH/H2O"], temperature: "80 °C", time: "12 h", yield: "88%", products: [{ text: S.methoxybiphenyl, number: "3" }] }] };

// Elliot's figure as an agent drew it with draw_figure (plan section 20): the restyle case starts from it.
const LANTHANIDE = JSON.parse(readFileSync(new URL("./lanthanide.json", import.meta.url), "utf8"));
// The figure's five compound numbers, with or without spaces (S-1, S - 1), and its five structures.
const figureParts = (d) => [[d.structures.length >= 5, "five structures", String(d.structures.length)], ...["S-1", "S-2", "S-3", "I-1", "I-2"].map((n) => [[...d.structures.map((s) => s.number ?? ""), words(d)].join(" ").replace(/\s/g, "").includes(n.toLowerCase()) || d.structures.some((s) => s.number?.replace(/\s/g, "") === n), `${n} is there`])];

export const CASES = [
  // ---- J1: schemes from procedures ----
  { id: "scheme-fischer", set: "train", job: "scheme",
    prompt: "Draw this reaction in Octet: A mixture of benzoic acid (12.2 g, 100 mmol), methanol (50 mL) and concentrated sulfuric acid (1 mL) was heated at reflux for 6 h. Work-up gave methyl benzoate (12.0 g, 88%).",
    check: ({ d, key }) => [...is(d, key(S.benzoicAcid), "benzoic acid", { as: "reactant" }), ...is(d, key(S.methylBenzoate), "methyl benzoate", { as: "product" }), [says(d, "H2SO4", "sulfuric"), "the acid is shown"], [says(d, "reflux"), "reflux is shown"], [says(d, "88%", "88 %"), "the yield is shown"], clean(d), ...layout(d)] },
  { id: "scheme-suzuki", set: "train", job: "scheme",
    prompt: `Draw the scheme for this and number the product 3. ${SUZUKI}`,
    check: ({ d, key }) => [...is(d, key(S.bromoanisole), "4-bromoanisole", { as: "reactant" }), ...is(d, key(S.methoxybiphenyl), "4-methoxybiphenyl", { as: "product", number: "3" }), [says(d, "Pd(PPh3)4"), "the catalyst is shown"], [says(d, "K2CO3"), "the base is shown"], [says(d, "80 °C", "80 °c"), "the temperature is shown"], [says(d, "12 h"), "the time is shown"], [says(d, "88%"), "the yield is shown"], clean(d), ...layout(d)] },
  { id: "scheme-grignard", set: "train", job: "scheme",
    prompt: "Bromobenzene was converted to phenylmagnesium bromide with Mg turnings in dry THF. Benzophenone was added at 0 °C, the mixture was warmed to rt over 2 h and quenched with sat. aq. NH4Cl to give triphenylmethanol (81%). Draw this as a two-step scheme with the Grignard reagent drawn as the intermediate.",
    check: ({ d, key }) => [[steps(d) === 2, "two steps", String(steps(d))], ...is(d, key(S.phMgBr), "phenylmagnesium bromide", { as: "product" }), ...is(d, key(S.trityl), "triphenylmethanol", { as: "product" }), [says(d, "81%"), "the yield is shown"], [says(d, "NH4Cl"), "the quench is shown"], ...layout(d)] },
  { id: "scheme-boc", set: "train", job: "scheme",
    prompt: "Can you draw this? Benzylamine (1.07 g, 10.0 mmol) in CH2Cl2 (20 mL) was treated with Boc2O (2.40 g, 11.0 mmol) and Et3N (1.5 mL) at rt for 3 h to give tert-butyl benzylcarbamate (2.01 g, 97%).",
    check: ({ d, key }) => [...is(d, key(S.benzylamine), "benzylamine", { as: "reactant" }), ...is(d, key(S.bocBenzylamine), "the carbamate", { as: "product" }), [says(d, "Boc2O", "Boc₂O", "Boc anhydride"), "Boc2O is shown"], [says(d, "97%"), "the yield is shown"], clean(d), ...layout(d)] },
  { id: "scheme-wittig", set: "train", job: "scheme",
    prompt: "Draw: benzaldehyde and (carbethoxymethylene)triphenylphosphorane in toluene at 110 °C for 16 h gave ethyl (E)-cinnamate (92%, E/Z > 20:1).",
    check: ({ d, key }) => [...is(d, key(S.cinnamate), "ethyl (E)-cinnamate, with E geometry", { as: "product" }), [says(d, "92%"), "the yield is shown"], [says(d, "110 °C", "110 °c"), "the temperature is shown"], clean(d), ...layout(d)] },
  { id: "scheme-reductive-amination", set: "train", job: "scheme",
    prompt: "Draw the scheme. Cyclohexanone (0.98 g, 10.0 mmol) and benzylamine (1.07 g, 10.0 mmol) in 1,2-dichloroethane (30 mL) were stirred with NaBH(OAc)3 (3.18 g, 15.0 mmol) and AcOH (0.6 mL) at rt overnight, which gave N-benzylcyclohexanamine (1.70 g, 90%).",
    check: ({ d, key }) => [...is(d, key(S.benzylamine), "benzylamine", { as: "reactant" }), ...is(d, key(S.benzylCyclohexylamine), "N-benzylcyclohexanamine", { as: "product" }), [says(d, "NaBH(OAc)3"), "the reducing agent is shown"], [says(d, "90%"), "the yield is shown"], clean(d), ...layout(d)] },
  { id: "scheme-three-steps", set: "train", job: "scheme",
    prompt: "1-Octanol was oxidised under Swern conditions ((COCl)2, DMSO, CH2Cl2, −78 °C, then Et3N) to octanal (94%). Octanal was then treated with methyl (triphenylphosphoranylidene)acetate in CH2Cl2 at rt to give methyl (E)-dec-2-enoate (85%), which was hydrogenated (H2, 10% Pd/C, EtOAc, rt) to methyl decanoate (98%). Draw the three-step scheme and number the compounds 1 to 4.",
    check: ({ d, key }) => [[steps(d) === 3, "three steps", String(steps(d))], ...is(d, key(S.octanol), "1-octanol", { number: "1" }), ...is(d, key(S.octanal), "octanal", { number: "2" }), ...is(d, key(S.decenoate), "methyl (E)-dec-2-enoate", { number: "3" }), ...is(d, key(S.decanoate), "methyl decanoate", { number: "4" }), [says(d, "94%") && says(d, "85%") && says(d, "98%"), "each yield is shown"], clean(d), ...layout(d)] },
  { id: "scheme-diels-alder", set: "held", job: "scheme",
    prompt: "Draw this reaction with the right stereochemistry: freshly cracked cyclopentadiene and maleic anhydride in EtOAc at 0 °C gave the endo adduct, cis-5-norbornene-endo-2,3-dicarboxylic anhydride (89%).",
    check: ({ d, key, loose }) => [...is(d, loose(S.norbornene), "the adduct", { as: "product" }), [!!find(d, key(S.norbornene)), "the adduct is endo"], [says(d, "89%"), "the yield is shown"], clean(d), ...layout(d)] },
  { id: "scheme-paracetamol", set: "held", job: "scheme",
    prompt: "Draw the synthesis of paracetamol from 4-aminophenol and acetic anhydride in water at 85 °C for 15 min (76%).",
    check: ({ d, key }) => [...is(d, key(S.aminophenol), "4-aminophenol", { as: "reactant" }), ...is(d, key(S.paracetamol), "paracetamol", { as: "product" }), [says(d, "76%"), "the yield is shown"], clean(d), ...layout(d)] },
  { id: "scheme-benzylation", set: "held", job: "scheme",
    prompt: "4-Hydroxybenzaldehyde (1.22 g, 10.0 mmol), benzyl bromide (1.3 mL, 11 mmol) and K2CO3 (2.76 g, 20.0 mmol) in DMF (20 mL) were stirred at 60 °C for 4 h, which gave 4-(benzyloxy)benzaldehyde (2.02 g, 95%). Draw it, with the phenol as 1 and the product as 2.",
    check: ({ d, key }) => [...is(d, key(S.hydroxybenzaldehyde), "the phenol", { as: "reactant", number: "1" }), ...is(d, key(S.benzyloxybenzaldehyde), "the benzyl ether", { as: "product", number: "2" }), [says(d, "K2CO3"), "the base is shown"], [says(d, "95%"), "the yield is shown"], clean(d), ...layout(d)] },

  // ---- J2: redraw from a picture ----
  { id: "picture-caffeine", set: "train", job: "picture", picture: { structures: [{ text: "caffeine" }] },
    prompt: "Redraw the structure in this picture in Octet.",
    check: ({ d, key }) => [...is(d, key(S.caffeine), "caffeine"), [d.structures.length === 1, "one structure", String(d.structures.length)], clean(d)] },
  { id: "picture-ibuprofen", set: "train", job: "picture", picture: { structures: [{ text: S.sIbuprofen }] },
    prompt: "Redraw this in Octet, with its stereochemistry.",
    check: ({ d, key }) => [...is(d, key(S.sIbuprofen), "(S)-ibuprofen"), clean(d)] },
  { id: "picture-scheme", set: "train", job: "picture", picture: { reaction: SUZUKI_DRAWN },
    prompt: "Here is a scheme from my notes. Redraw it in Octet as it is.",
    check: ({ d, key }) => [...is(d, key(S.bromoanisole), "4-bromoanisole", { as: "reactant" }), ...is(d, key(S.methoxybiphenyl), "4-methoxybiphenyl", { as: "product", number: "3" }), [says(d, "Pd(PPh3)4"), "the catalyst is shown"], [says(d, "80 °C", "80 °c"), "the temperature is shown"], [says(d, "88%"), "the yield is shown"], ...layout(d)] },
  { id: "picture-menthol", set: "held", job: "picture", picture: { structures: [{ text: S.menthol }] },
    prompt: "Can you draw this one for me in Octet? Keep the wedges.",
    check: ({ d, key }) => [...is(d, key(S.menthol), "(−)-menthol, with its stereocentres"), clean(d)] },
  { id: "picture-tbs", set: "held", job: "picture", picture: { structures: [{ text: S.tbsEther }] },
    prompt: "Redraw this structure.",
    check: ({ d, loose }) => [...is(d, loose(S.tbsEther), "the TBS ether"), clean(d)] },

  // ---- J3: two-way read and fix ----
  { id: "fix-valence", set: "train", job: "fix", setup: [["draw_structures", { structures: [{ text: "CC(C)(C)(C)(C)O" }] }]],
    prompt: "This should be tert-butanol. Find what is wrong with my drawing and fix it.",
    check: ({ d, key }) => [...is(d, key(S.tBuOH), "tert-butanol"), [d.structures.length === 1, "one structure", String(d.structures.length)], clean(d)] },
  { id: "fix-product", set: "train", job: "fix", setup: [["draw_reaction", { start: [{ text: "acetic acid" }, { text: "ethanol" }], steps: [{ reagents: ["H2SO4 (cat.)"], temperature: "reflux", products: [{ text: S.propylAcetate, number: "3" }] }] }]],
    prompt: "Is the product in this scheme right? Fix it if not, and keep its number.",
    check: ({ d, key }) => [...is(d, key(S.ethylAcetate), "ethyl acetate", { as: "product", number: "3" }), [!find(d, key(S.propylAcetate)), "propyl acetate is gone"], clean(d), ...layout(d)] },
  { id: "fix-numbers", set: "train", job: "fix", setup: [["draw_structures", { structures: [{ text: "benzene", number: "1" }, { text: "toluene", number: "1" }, { text: "phenol" }] }]],
    prompt: "Tidy up my compound numbers so that each compound has its own number, starting at 1.",
    check: ({ d }) => { const n = d.structures.map((s) => s.number).sort(); return [[JSON.stringify(n) === '["1","2","3"]', "numbered 1, 2 and 3", JSON.stringify(n)], clean(d)]; } },
  { id: "read-identify", set: "train", job: "read", setup: [["draw_structures", { structures: [{ text: S.aspirin, number: "1" }, { text: S.ibuprofen, number: "2" }] }]],
    prompt: "What are compounds 1 and 2 in my drawing, and what are their molecular formulae?",
    check: ({ d, answer }) => { const a = sub(answer).toLowerCase(); return [[/aspirin|acetylsalicylic/.test(a), "names aspirin"], [/ibuprofen/.test(a), "names ibuprofen"], [a.includes("c9h8o4"), "gives C9H8O4"], [a.includes("c13h18o2"), "gives C13H18O2"], [d.structures.length === 2, "the drawing is not changed", String(d.structures.length)]]; } },
  { id: "fix-stereo", set: "held", job: "fix", setup: [["draw_structures", { structures: [{ text: S.rIbuprofen, number: "1" }] }]],
    prompt: "This is meant to be (S)-ibuprofen, the active one. Fix it.",
    check: ({ d, key }) => [...is(d, key(S.sIbuprofen), "(S)-ibuprofen", { number: "1" }), [!find(d, key(S.rIbuprofen)), "(R) is gone"], clean(d)] },
  { id: "fix-check", set: "held", job: "fix", setup: [["draw_structures", { structures: [{ text: "c1ccccc1N(=O)=O", number: "1" }, { text: "CC(=O)OCC", number: "2" }] }]],
    prompt: "Check my drawing for errors and fix any you find.",
    check: ({ d }) => [clean(d), [d.structures.some((s) => s.formula === "C6H5NO2" && s.number === "1"), "nitrobenzene is still 1"], [d.structures.length === 2, "two structures", String(d.structures.length)]] },

  // ---- J4: experiment pages ----
  { id: "experiment-boc", set: "train", job: "experiment", for: "experiment",
    prompt: "Fill in this experiment page from my procedure: draw the reaction and fill in the reagent table and the details. Title it 'Boc protection of benzylamine', notebook SE-120, date 4 November 2026. Procedure: benzylamine (1.07 g, 10.0 mmol) in CH2Cl2 (20 mL) was treated with Boc2O (2.40 g, 11.0 mmol) and Et3N (1.5 mL) at rt for 3 h to give tert-butyl benzylcarbamate (2.01 g).",
    check: ({ d, key }) => [[d.experiment?.title === "Boc protection of benzylamine", "title", d.experiment?.title], [d.experiment?.notebook === "SE-120", "notebook", d.experiment?.notebook], ...is(d, key(S.bocBenzylamine), "the carbamate", { as: "product" }), amount(d, key(S.benzylamine), "mass", 1.07), [d.reagentTables?.[0]?.limiting === d.reagentTables?.[0]?.columns.find((c) => c.formula === "C7H9N")?.key, "benzylamine is limiting", d.reagentTables?.[0]?.limiting], amount(d, key(S.bocBenzylamine), "measured", 2.01), counted(d), ...layout(d)] },
  { id: "experiment-suzuki", set: "train", job: "experiment", for: "experiment",
    prompt: `Set this page up for my Suzuki coupling, with the reagent table filled in and the title 'Suzuki coupling'. ${SUZUKI}`,
    check: ({ d, key }) => [[/suzuki/i.test(d.experiment?.title ?? ""), "title", d.experiment?.title], ...is(d, key(S.methoxybiphenyl), "4-methoxybiphenyl", { as: "product" }), amount(d, key(S.bromoanisole), "mass", 1.87), amount(d, key(S.phenylboronic), "mass", 1.46), [d.reagentTables?.[0]?.limiting === d.reagentTables?.[0]?.columns.find((c) => c.formula === "C7H7BrO")?.key, "4-bromoanisole is limiting", d.reagentTables?.[0]?.limiting], amount(d, key(S.methoxybiphenyl), "measured", 1.62), counted(d), ...layout(d)] },
  { id: "experiment-fischer", set: "held", job: "experiment", for: "experiment",
    prompt: "Make this into my experiment page, called 'Methyl benzoate', with the amounts in the table: a mixture of benzoic acid (12.2 g, 100 mmol), methanol (50 mL) and concentrated sulfuric acid (1 mL) was heated at reflux for 6 h. Work-up gave methyl benzoate (12.0 g).",
    check: ({ d, key }) => [[d.experiment?.title === "Methyl benzoate", "title", d.experiment?.title], amount(d, key(S.benzoicAcid), "mass", 12.2), amount(d, key(S.methylBenzoate), "measured", 12), counted(d), ...layout(d)] },

  // ---- J5: cycles and grids ----
  { id: "cycle-suzuki", set: "train", job: "cycle",
    prompt: "Draw the catalytic cycle for a Suzuki coupling of bromobenzene with phenylboronic acid: Pd(0)L2, oxidative addition, transmetalation with the boronate, then reductive elimination to biphenyl.",
    check: ({ d }) => [[d.cycles.length === 1, "one cycle", String(d.cycles.length)], [(d.cycles[0]?.intermediates.filter(Boolean).length ?? 0) >= 3, "three or more intermediates drawn"], [(d.cycles[0]?.names.length ?? 0) >= 3, "the steps are named"], clean(d), ...layout(d)] },
  { id: "grid-amides", set: "train", job: "grid",
    prompt: "Draw these six amides in a grid, numbered 5a to 5f in this order: N-benzylacetamide, N-benzylbenzamide, N-benzylpropanamide, N-benzyl-2-methylpropanamide, N-benzylcyclopropanecarboxamide and N-benzyl-2,2-dimethylpropanamide.",
    check: ({ d, key }) => { const rows = new Set(d.structures.map((s) => Math.round(((s.box?.[1] ?? 0) + (s.box?.[3] ?? 0)) / 2))); return [...S.amides.flatMap((x, k) => is(d, key(x), `amide 5${"abcdef"[k]}`, { number: `5${"abcdef"[k]}` })), [rows.size >= 2 && rows.size < 6, "laid out in rows", `${rows.size} rows`], clean(d), ...layout(d)]; } },
  { id: "cycle-buchwald", set: "held", job: "cycle",
    prompt: "Draw the catalytic cycle of a Buchwald–Hartwig amination of an aryl bromide with a secondary amine, catalysed by Pd(0) with a phosphine, with NaOtBu as the base.",
    check: ({ d }) => [[d.cycles.length === 1, "one cycle", String(d.cycles.length)], [(d.cycles[0]?.intermediates.filter(Boolean).length ?? 0) >= 3, "three or more intermediates drawn"], [(d.cycles[0]?.names.length ?? 0) >= 3, "the steps are named"], clean(d), ...layout(d)] },
  { id: "grid-biaryls", set: "held", job: "grid",
    prompt: "I coupled 4-bromoanisole with four boronic acids: phenyl, 4-fluorophenyl, 3-pyridyl and 2-thienyl. Draw the four products in a grid, numbered 7a to 7d in that order.",
    check: ({ d, key }) => [...S.biaryls.flatMap((x, k) => is(d, key(x), `product 7${"abcd"[k]}`, { number: `7${"abcd"[k]}` })), clean(d), ...layout(d)] },

  // ---- J6: style and export ----
  { id: "style-jacs", set: "train", job: "style", setup: [["set_style", { preset: "New Document (ChemDraw)" }], ["draw_reaction", SUZUKI_DRAWN]],
    prompt: "Make this drawing ready for a figure in a J. Am. Chem. Soc. paper.",
    check: ({ d }) => [[d.style === "ACS Document 1996", "the ACS style", d.style], ...layout(d)] },
  { id: "style-rsc", set: "train", job: "style", setup: [["draw_reaction", SUZUKI_DRAWN]],
    prompt: "Change my drawing to the RSC style, two-column width.",
    check: ({ d }) => [[d.style === "RSC", "the RSC style", d.style], ...layout(d)] },
  { id: "read-smiles", set: "train", job: "read", setup: [["draw_reaction", SUZUKI_DRAWN]], answerSmiles: true,
    prompt: "Give me the SMILES of every compound in this drawing.",
    check: ({ d, answered }) => d.structures.map((s) => [answered.includes(s.inchiKey), `gives ${s.name ?? s.formula} as SMILES`]) },
  { id: "style-wiley", set: "held", job: "style", setup: [["draw_reaction", SUZUKI_DRAWN]],
    prompt: "This is going in Angewandte. Set the drawing up for it.",
    check: ({ d }) => [[d.style === "Wiley (Angewandte)", "the Wiley style", d.style], ...layout(d)] },

  // ---- Speed (plan section 21): Elliot's figure from its picture, and restyling it. set "speed": run only by name.
  // pictureFile: the picture is in out/ (Sam's, not in the repository).
  { id: "figure-lanthanide", set: "speed", job: "figure", pictureFile: "lanthanide-figure.png",
    prompt: "Recreate the figure in this picture in Octet: both panels, titles, citations, every structure with its labels, wedges and colours, the numbers, the M = lines and the brackets. Make it look as good as the picture.",
    check: ({ d }) => [...figureParts(d), ...layout(d)] },
  { id: "restyle-lanthanide", set: "speed", job: "figure", setup: [["draw_figure", LANTHANIDE]], pictureFile: "lanthanide-figure-restyled.png",
    prompt: "Restyle my figure so it looks like this picture: the panel titles and citations, the numbers and captions under the structures, the colours, the line between the panels and the box round the side text. Keep the structures as they are.",
    check: ({ d }) => [...figureParts(d), [says(d, "siloxides") && says(d, "imidophosphoranes"), "both titles"], [(d.shapes?.length ?? 0) >= 1, "a shape (the box or the line)", String(d.shapes?.length ?? 0)], ...layout(d)] },
];
