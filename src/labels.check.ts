// Run: node src/labels.check.ts. Fails loudly if label reading breaks.
import assert from "node:assert/strict";
import { anchorElement, attachmentFirst, chemicalText, formulaRuns, isElement, labelSmiles, pieces, standsIn, units } from "./labels.ts";
import { render, type Ink } from "./render.ts";
import { widthOf } from "./arial.ts";

assert.deepEqual(units("CO2Et").map((u) => [u.text, u.count ?? ""]), [["C", ""], ["O", "2"], ["Et", ""]]);
assert.deepEqual(units("NHBoc").map((u) => u.text), ["N", "H", "Boc"]);
assert.deepEqual(units("N(Boc)2").map((u) => [u.text, u.count ?? ""]), [["N", ""], ["(Boc)", "2"]]);
assert.deepEqual(units("CCl3").map((u) => [u.text, u.count ?? ""]), [["C", ""], ["Cl", "3"]]);
// A word Octet cannot read as elements and groups is one unit (an abbreviation it does not know), after its first
// element when an abbreviation follows: ODMT is O and DMT, never O, D, M, T.
for (const [label, want] of Object.entries({ ODMT: "O|DMT", DMT: "DMT", ODMTr: "O|DMTr", CH2ODMT: "C|H2|O|DMT", NPhth: "N|Phth", NHPG: "N|H|PG",
  SEM: "SEM", OSEM: "O|SEM", PG: "PG", ONf: "O|Nf", Nu: "Nu", ALK: "ALK", "R'": "R'", OR: "O|R", NR2: "N|R2", OTBS: "O|TBS", NHBoc: "N|H|Boc",
  // A stand-in after a formula or after the word's first atom or stand-in is its own unit.
  OPG: "O|PG", OL: "O|L", OLG: "O|LG", HNu: "H|Nu", MLn: "M|Ln", CO2Alkyl: "C|O2|Alkyl", OAlkyl: "O|Alkyl" }))
  assert.equal(units(label).map((u) => u.text + (u.count ?? "")).join("|"), want, label);
assert.equal(anchorElement("OMe"), "O");
assert.equal(anchorElement("Ph"), undefined);
assert.ok(isElement("Cl") && !isElement("OMe"));
const cases: Record<string, string> = {
  OMe: "OC", CO2Et: "C(=O)OCC", CO2H: "C(=O)O", CF3: "C(F)(F)F", NHBoc: "NC(=O)OC(C)(C)C", NMe2: "N(C)C",
  CH2OH: "CO", OH: "O", CN: "C#N", "N(Boc)2": "N(C(=O)OC(C)(C)C)C(=O)OC(C)(C)C", Ph: "c1ccccc1", PPh3: "P(c1ccccc1)(c1ccccc1)(c1ccccc1)",
  // Read from the attachment atom with every valence used (condensed.ts condensedLabel): azide, nitro, nitrile,
  // isocyanate, sulfone, sulfonyl azide, ester and amide groups inside a label, which a left-to-right reading made
  // amines and alcohols (CH2N3 was C(N)(N)(N), with two H on each N).
  CH2N3: "CN=[N+]=[N-]", SO2N3: "S(=O)(=O)N=[N+]=[N-]", CON3: "C(=O)N=[N+]=[N-]", CH2NO2: "C[N+](=O)[O-]", CH2CN: "CC#N",
  CH2NCO: "CN=C=O", CH2NCS: "CN=C=S", CH2SCN: "CSC#N", SO2Me: "S(=O)(=O)C", SO2NH2: "S(=O)(=O)N", CH2CO2Me: "CC(=O)OC",
  CONHMe: "C(=O)NC", NHSO2Me: "NS(=O)(=O)C", CHN2: "C=[N+]=[N-]", PO3H2: "P(=O)(O)O", NCMe2: "N=C(C)C",
};
for (const [label, smiles] of Object.entries(cases)) assert.equal(labelSmiles(label), smiles, label);
assert.equal(labelSmiles("Hello world"), undefined);
// Labels written right to left read from the atom that attaches, and no label starts its SMILES with a branch.
const reversed: Record<string, string> = {
  H2O2: "OO", HO2C: "C(=O)O", HOOC: "C(=O)O", OHC: "C=O", O2N: "[N+](=O)[O-]", MeO: "O(C)", EtO2C: "C(=O)O(CC)", Et3N: "N(CC)(CC)(CC)", BocHN: "N(C(=O)OC(C)(C)C)",
};
for (const [label, smiles] of Object.entries(reversed)) assert.equal(labelSmiles(label), smiles, label);
for (const label of ["H2O2", "Me3Si", "(CH2)3", "Ph2", "H2(Boc)2", "HN(Me)2"]) assert.ok(!labelSmiles(label)?.startsWith("("), label);
// Groups written as formulas read as chemists write them: C2H5 is ethyl and C6H5 phenyl wherever they are in a label
// (OC2H5 was O(C)(C), C6H5 a hexyl chain). A label whose first atom its hydrogens fill is written from the left and
// bonds at its end (CH3CO is acetyl). A carbon counted before its hydrogens with no one structure is not read.
const formulas: Record<string, string> = {
  OC2H5: "OCC", C6H5: "c1ccccc1", COOC2H5: "C(=O)OCC", CH3CO: "C(C)=O", C6H11: "C1CCCCC1", C2H5: "CC", "n-C3H7": "CCC", C3H7: "CCC",
  "i-C3H7": "C(C)C", "t-C4H9": "C(C)(C)C", "s-C4H9": "C(C)CC", "i-C4H9": "CC(C)C", "n-C4H9": "CCCC", C6H13: "CCCCCC", OC5H11: "OCCCCC",
  CH2CH3: "CC", CH3CH2: "CC", CO2C2H5: "C(=O)OCC", OCOCH3: "OC(=O)C", CH3CO2: "OC(C)=O", NHC6H5: "Nc1ccccc1", OC6H5: "Oc1ccccc1",
  CH2C6H5: "Cc1ccccc1", C6H5CH2: "C(c1ccccc1)", "N(C2H5)2": "N(CC)CC", C2H5O: "O(CC)", CH3O: "OC", C2H5OOC: "C(=O)OCC",
  CH2CO2C2H5: "CC(=O)OCC", OCOC6H5: "OC(=O)c1ccccc1", "P(C6H11)2": "P(C1CCCCC1)C1CCCCC1", "4-BrC6H4": "c3ccc(Br)cc3",
};
for (const [label, smiles] of Object.entries(formulas)) assert.equal(labelSmiles(label), smiles, label);
for (const label of ["C6H4", "CH2C6H4Br", "C6H4CH3", "C2H3", "C3H5", "C10H7", "C6H6"]) assert.equal(labelSmiles(label), undefined, label);
assert.equal(labelSmiles("C999"), undefined);
// Labels Indigo cannot lay out in good time are not read: an atom with more than eight neighbours or more than four
// groups with a ring on it, a ring atom with more than four neighbours, or more than 120 atoms. Others are read.
for (const label of ["Ph4", "Ph6", "Ph10", "(Ph)6", "PhPh4", "PhPh5", "CPh5", "CPh50", "CyCy5", "TsTs5", "Fmoc12", "CPh4Ph4", "(PhPh4)4", "PhCl12", "CCl99", "(CCl9)30", "(C99)99", "C99C99", "CyPh4ClTr", "TsCyTrPMeClTr", "TBDPSP99", "Si12Si99MeC5"]) assert.equal(labelSmiles(label), undefined, label);
for (const label of ["Ph2", "Ph3", "CPh3", "Ph3C", "Ph3P", "BPh4", "Ph4B", "Pd(PPh3)4", "CTr4", "SF5", "PF6", "W(CO)6", "Fe(CO)5", "CCl3", "C99", "(CH2)3", "TBDPS", "Si(iPr)3", "Fmoc", "Mes", "Tr"]) assert.ok(labelSmiles(label), label);
// Formulas in conditions and tables: counts after an element, group or bracket are subscripts; other numbers are not.
const runs = (t: string) => formulaRuns(t).map((r) => (r.sub ? `_${r.text}` : r.text)).join("");
for (const [t, want] of Object.entries({
  K2CO3: "K_2CO_3", "Pd(PPh3)4": "Pd(PPh_3)_4", Et3N: "Et_3N", "DMSO-d6": "DMSO-d_6", "[Rh(cod)Cl]2": "[Rh(cod)Cl]_2", B2pin2: "B_2pin_2",
  "1,4-dioxane": "1,4-dioxane", "12 h": "12 h", L1: "L1", B3LYP: "B3LYP", "THF/H2O (4:1)": "THF/H_2O (4:1)", "2a": "2a",
  "Pd(0)L2": "Pd(0)L_2", HNR2: "HNR_2", PdX2: "PdX_2", R2: "R2",
})) assert.equal(runs(t), want, t);
// A label of more than one line is text: no chemistry reads it (it counts as an unknown atom), and it is no element.
for (const t of ["Direct,\nNo ISC", "OMe\nCH3", "N\nH"]) assert.ok(labelSmiles(t) === undefined && !isElement(t), JSON.stringify(t));
console.log("labels.check: ok");

// Issue 44: the counts inside a bracket are subscripts on the canvas and in pictures, as the 2 after it is (and as
// ChemDraw draws the CDXML). Pieces keep the label's text in order; reading a label for its chemistry is unchanged.
const drawn = (label: string) => units(label).flatMap(pieces).map((u) => [u.text, u.count ?? ""]);
assert.deepEqual(drawn("N(CH3)2"), [["N", ""], ["(CH", "3"], [")", "2"]]);
assert.deepEqual(drawn("C(O)OCH3"), [["C", ""], ["(O)", ""], ["O", ""], ["C", ""], ["H", "3"]]);
assert.deepEqual(drawn("CH2CH(CH3)2"), [["C", ""], ["H", "2"], ["C", ""], ["H", ""], ["(CH", "3"], [")", "2"]]);
assert.deepEqual(drawn("Pd(PPh3)4"), [["Pd", ""], ["(PPh", "3"], [")", "4"]]);
assert.deepEqual(drawn("Fe(0)"), [["Fe", ""], ["(0)", ""]]); // an oxidation state is no count
for (const l of ["N(CH3)2", "C(O)OCH3", "CH2CH(CH3)2", "Pd(PPh3)4"]) assert.equal(drawn(l).flat().join(""), l);
assert.equal(labelSmiles("N(CH3)2"), "N(C)C");
// A label that leaves out what a chemist takes as read gets no double bond it does not write (Si=O, S≡C) and no
// O–O: it is read left to right as before.
for (const [label, smiles] of Object.entries({ SiOMe: "[Si]O(C)", SCMe: "SC(C)" })) assert.equal(labelSmiles(label), smiles, label);
assert.ok(!/OO|#/.test(labelSmiles("CCO2H") ?? ""), "CCO2H: no peroxide, no triple bond");
// Drawn: every digit of these labels is a subscript (75% size), read left to right and right to left.
{
  const pt = 4 / 3, L = 14.4 * pt, S = { bond: L, line: 0.6 * pt, bold: 2 * pt, spacing: 0.18 * 14.4 * pt, hash: 2.5 * pt, margin: 1.69 * pt, size: 10 * pt };
  const ink = (text: string): Ink => { const w = widthOf(text, S.size), a = 0.716 * S.size; return { width: w, ascent: a, outline: [[0, 0], [w, -a]] }; };
  for (const text of ["N(CH3)2", "C(O)OCH3", "CH2CH(CH3)2"]) for (const dx of [1, -1]) {
    const d = render({ atoms: [{ label: "C", location: [0, 0, 0] }, { label: text[0], text, location: [dx, 0, 0] }], bonds: [{ atoms: [0, 1], type: "single" }] } as never, S, ink, L);
    const small = d.labels.filter((l) => l.size < S.size * 0.9).map((l) => l.text).join(""), digits = text.replace(/\D/g, "");
    assert.equal([...small].sort().join(""), [...digits].sort().join(""), `${text} drawn ${dx > 0 ? "left to right" : "right to left"}: subscripts ${small}`);
    assert.equal(d.labels.map((l) => l.text).join("").length, text.length);
  }
}

// Superscript and subscript set by hand on part of a label (issue 44): drawn, not read. Fe with III raised reads as
// Fe(III) (iron, oxidation state III, no charge). A raised mass number (13CH3), a charge (NH4+) and a count stay.
{
  assert.equal(chemicalText("FeIII", [{ text: "Fe" }, { text: "III", script: "super" }]), "Fe(III)");
  assert.equal(chemicalText("CH2Rb", [{ text: "CH2R" }, { text: "b", script: "super" }]), "CH2R");
  assert.equal(chemicalText("OMea", [{ text: "OMe" }, { text: "a", script: "sub" }]), "OMe");
  assert.equal(chemicalText("13CH3", [{ text: "13", script: "super" }, { text: "CH3" }]), "13CH3");
  assert.equal(chemicalText("NH4+", [{ text: "NH" }, { text: "4", script: "sub" }, { text: "+", script: "super" }]), "NH4+");
  assert.equal(chemicalText("OH", [{ text: "OH", script: "super" }]), "OH"); // all raised: read as it is
  assert.equal(chemicalText("OMe", [{ text: "O", bold: true } as never, { text: "Me" }]), "OMe"); // no script: unchanged
  assert.equal(chemicalText("FeIII", [{ text: "Fe" }, { text: "II", script: "super" }]), "FeIII"); // runs that do not spell the text: as typed
  // Drawn: Fe in full size, III small and raised, after the Fe however the label reads.
  const pt = 4 / 3, L = 14.4 * pt, S = { bond: L, line: 0.6 * pt, bold: 2 * pt, spacing: 0.18 * 14.4 * pt, hash: 2.5 * pt, margin: 1.69 * pt, size: 10 * pt };
  const ink = (text: string): Ink => { const w = widthOf(text, S.size), a = 0.716 * S.size; return { width: w, ascent: a, outline: [[0, 0], [w, -a]] }; };
  for (const dx of [1, -1]) {
    const d = render({ atoms: [{ label: "C", location: [0, 0, 0] }, { label: "Fe", text: "FeIII", runs: [{ text: "Fe" }, { text: "III", script: "super" }], location: [dx, 0, 0] }], bonds: [{ atoms: [0, 1], type: "single" }] } as never, S, ink, L);
    const fe = d.labels.find((l) => l.text === "Fe")!, iii = d.labels.filter((l) => l !== fe);
    assert.ok(fe && iii.map((l) => l.text).join("") === "III", `FeIII drawn ${dx}`);
    for (const l of iii) {
      assert.ok(Math.abs(l.size - 0.75 * S.size) < 1e-6 && Math.abs(fe.size - S.size) < 1e-6, "III at 75%");
      assert.ok(l.y < fe.y - 0.2 * S.size, "III raised");
      assert.ok(l.x > fe.x, `III after Fe (${dx > 0 ? "left to right" : "right to left"})`);
    }
  }
  console.log("labels.check: superscript and subscript in labels ok");
}

// The labels of the paper corpus (docs/plans/mcp-v2-corpus-faults.md, 11 November 2026). Each family is read by one
// rule: no spelling has a table entry of its own.
{
  const split = (label: string) => units(label).map((u) => u.text + (u.count ?? "")).join("|");
  // A prefix n, i, s or t with its hyphen is one group, so a label drawn from the right keeps it whole (t-BuO). A
  // group that starts with a small letter ends the word before it, with a hyphen even where the word is an element.
  // A diolate's name is a unit of its own. A phenyl with its positions, and n- before a formula, is one unit.
  for (const [label, want] of Object.entries({ "t-Bu": "t-Bu", "Ot-Bu": "O|t-Bu", OtBu: "O|tBu", "i-PrO": "i-Pr|O", "CO2t-Bu": "C|O2|t-Bu", NHtBu: "N|H|tBu", NMeiPr: "N|Me|iPr",
    SnBu3: "Sn|Bu3", "Os-Bu": "O|s-Bu", "Pt-Bu2": "P|t-Bu2", "n-Oct": "n-Oct", Oallyl: "O|allyl", pinB: "pin|B", "9-BBN": "9-BBN", OAr: "O|Ar", Ar2N: "Ar2|N", Alkyl: "Alkyl", HetAr: "HetAr",
    Bpin: "B|pin", CH2Bpin: "C|H2|B|pin", "4-ClC6H4": "4-ClC6H4", "3,5-(CF3)2C6H3": "3,5-(CF3)2C6H3", "n-C8H17": "n-C8H17", MIV: "MIV", "M(IV)": "M(IV)" }))
    assert.equal(split(label), want, label);
  // Each reads as the same label without its hyphen, with a capital, or written from its attachment atom (the same
  // SMILES, character for character; more pairs are compared as structures below).
  for (const [label, same] of Object.entries({ "t-Bu": "tBu", "i-Pr": "iPr", "n-Bu": "Bu", "s-Bu": "sBu", "n-Pr": "Pr", "n-Oct": "Oct", nOct: "Oct", "n-C8H17": "C8H17", "Ot-Bu": "OtBu", "Oi-Pr": "OiPr",
    "CO2t-Bu": "CO2tBu", "SO2t-Bu": "SO2tBu", allyl: "Allyl", All: "Allyl", vinyl: "Vinyl", Oallyl: "OAllyl", SO2allyl: "SO2Allyl", BPin: "Bpin", "B(pin)": "Bpin", pinB: "Bpin", BBN: "9-BBN",
    F3B: "BF3", KF3B: "BF3K", D3C: "CD3", DO: "OD", DS: "SD", D2N: "ND2", H2N: "NH2", "P(O)(OEt)2": "PO(OEt)2", "C(O)OMe": "CO2Me", "S(O)2Me": "SO2Me", COtBu: "C(O)tBu",
    MeO2S: "SO2Me", F3CO2S: "SO2CF3", "t-BuO2S": "SO2tBu", "Ph2(O)P": "P(O)Ph2", "(EtO)2(O)P": "P(O)(OEt)2", EtOC: "COEt", Me2NOC: "CONMe2",
    "4-ClPh": "4-ClC6H4", "p-ClC6H4": "4-ClC6H4", "o-MeC6H4": "2-MeC6H4", "m-FC6H4": "3-FC6H4", "4-Cl-C6H4": "4-ClC6H4", "3,5-Me2Ph": "3,5-Me2C6H3", "4-MeOC6H4": "4-OMeC6H4", "4-NCC6H4": "4-CNC6H4",
    "4-O2NC6H4": "4-NO2C6H4", "4-F3CC6H4": "4-CF3C6H4", "4-BocNHC6H4": "4-NHBocC6H4", "4-TBSOC6H4": "4-OTBSC6H4", "4-pinBC6H4": "4-BpinC6H4", "3,5-(MeO)2C6H3": "3,5-(OMe)2C6H3" }))
    assert.ok(labelSmiles(label) && labelSmiles(label) === labelSmiles(same), `${label} reads as ${same}: ${labelSmiles(label)}, ${labelSmiles(same)}`);
  assert.equal(labelSmiles("OtBu"), "OC(C)(C)C");
  assert.equal(labelSmiles("Bpin"), "B1OC(C)(C)C(C)(C)O1");
  assert.equal(labelSmiles("CH2Bpin"), "CB1OC(C)(C)C(C)(C)O1");
  assert.equal(labelSmiles("N(Bpin)2"), "N(B1OC(C)(C)C(C)(C)O1)(B1OC(C)(C)C(C)(C)O1)");
  assert.equal(labelSmiles("BF3K"), "[B-](F)(F)F.[K+]");
  assert.equal(labelSmiles("P(O)(OEt)2"), "P(=O)(OCC)OCC");
  assert.equal(labelSmiles("(EtO)2(O)P"), "P(=O)(OCC)OCC");
  assert.equal(labelSmiles("S(O)Me"), "S(=O)C");
  assert.equal(labelSmiles("C(S)NH2"), "C(=S)N");
  // NC is an isocyanide, its bond on N, as Octet reads every label from its attachment atom (the AI apps' NC for a *
  // is the nitrile: mcp.check.ts). On a ring it is written towards the ring, as MeO and O2N are: the nitrile.
  assert.equal(labelSmiles("NC"), "[N+]#[C-]");
  assert.equal(labelSmiles("4-NCC6H4"), "c3ccc(C#N)cc3");
  // Hydrogen and its isotopes: alone, counted, or the one atom beside another. Tritium is not read first (T3P, TS).
  for (const [label, smiles] of Object.entries({ H: "[H]", D: "[2H]", T: "[3H]", CD3: "C([2H])([2H])([2H])", CHD2: "C([2H])([2H])", OD: "O([2H])", OT: "O([3H])", CT3: "C([3H])([3H])([3H])", D2O: "O([2H])([2H])", "N(CD3)2": "N(C([2H])([2H])([2H]))(C([2H])([2H])([2H]))" }))
    assert.equal(labelSmiles(label), smiles, label);
  // A phenyl with what is on it, and where: one group, or as many of one group as there are positions. The ring's
  // number is not one the group uses.
  assert.equal(labelSmiles("4-ClC6H4"), "c3ccc(Cl)cc3");
  assert.equal(labelSmiles("3,5-(CF3)2C6H3"), "c3cc(C(F)(F)F)cc(C(F)(F)F)c3");
  assert.equal(labelSmiles("2,4,6-Me3C6H2"), "c3c(C)cc(C)cc3(C)");
  assert.equal(labelSmiles("4-PhC6H4"), "c3ccc(c1ccccc1)cc3");
  assert.equal(labelSmiles("4-(4-ClC6H4)C6H4"), "c4ccc(c3ccc(Cl)cc3)cc4");
  // Not read: a stand-in for a group (Ar is no phenyl, and no argon), with what is written round it; a word Octet does
  // not know; a diolate with no boron; a phenyl whose positions and groups do not agree, with a linker on it (4-OPh is
  // no biphenylol), or with a count that is the group's own (the 2 of NO2); and capitals that spell no group, where a
  // D or T is a letter of an abbreviation (OTPS is no tritium compound, CDI no deuterium on carbon).
  for (const label of ["Ar", "Ar1", "Ar'", "OAr", "ArO", "NHAr", "CH2Ar", "SO2Ar", "N(Ar)2", "R", "R1", "X", "OR", "NR2", "Het", "HetAr", "L", "Ln", "Alkyl", "Aryl", "EWG", "PG", "Nu", "MIV", "MII", "M(IV)", "Xyz", "ODMT", "n-Hex",
    "pin", "Spin", "B2pin2", "4-C6H4", "3,5-MeC6H3", "3,3-Me2C6H3", "1-ClC6H4", "4-ClC6H3", "4-XyzC6H4", "4-OPh", "4-SPh", "4-NPh", "4-NHPh", "4-CPh", "4-CHPh", "4-CH2Ph", "4-COPh", "4-SOPh", "4-SO2Ph", "4-OC6H4", "4-C(O)Ph",
    "3,5-NO2C6H3", "3,4,5-CF3C6H2", "3,5-OMeC6H3", "THF", "DBU", "DCC", "TPS", "OTPS", "CDI", "PDC", "BHT", "COT", "HBTU", "T3P", "CuTC", "TS", "T3C", "CDCl3", "CH2D", "PhD", "DCl",
    // A nitrile ligand written from its N: no amine (it was NC(C), ethylamino).
    "MeCN", "NCMe", "NCCH3", "PhCN", "NCPh"]) assert.equal(labelSmiles(label), undefined, label);
  assert.equal(labelSmiles("CH2CN"), "CC#N");
  for (const label of ["Ar", "Ar1", "Ar'", "Het", "HetAr", "L", "Ln", "L'", "Alkyl", "Aryl", "EWG", "EDG", "PG", "LG", "Nu", "E", "Hal", "R", "R1", "R''", "X", "ALK", "Q", "MIV", "MII", "MIII", "MX", "M(IV)", "M(0)"]) assert.ok(standsIn(label), label);
  for (const label of ["Xyz", "Ph", "Me", "ODMT", "OAr", "Arg", "Lys", "Li", "Al", "EtO", "All", "Allyl", "Mn", "Me", "MIVa", "M(IV", "MIV)", "M()"]) assert.ok(!standsIn(label), label);
  // What read before reads as before: tin, where Sn and Bu could be S and nBu; and every group's own name.
  assert.equal(labelSmiles("SnBu3"), "[Sn](CCCC)(CCCC)CCCC");
  assert.equal(labelSmiles("CO2tBu"), "C(=O)OC(C)(C)C");
  assert.equal(labelSmiles("Mes"), "c1c(C)cc(C)cc1C");
  // A label written from the left, as Octet keeps a label (the AI apps' tools store it so): from its attachment atom.
  // Others, and one that would read as another group written so (S and iPr as silicon), come back as they are.
  for (const [label, kept] of Object.entries({ MeO: "OMe", pinB: "Bpin", F3C: "CF3", "t-BuO": "Ot-Bu", O2N: "NO2", HO2C: "CO2H", OHC: "CHO", "t-BuNH": "NHt-Bu", BocHN: "NHBoc", H2N: "NH2", HO: "OH", Et3N: "NEt3", MeO2C: "CO2Me", TBSO: "OTBS", D3C: "CD3",
    OMe: "OMe", Bpin: "Bpin", NC: "NC", CN: "CN", NCO: "NCO", OCN: "OCN", iPrS: "iPrS", Ph: "Ph", "t-Bu": "t-Bu", "4-ClC6H4": "4-ClC6H4", "n-C8H17": "n-C8H17", R: "R", Ar: "Ar", Xyz: "Xyz", ODMT: "ODMT" }))
    assert.equal(attachmentFirst(label), kept, label);
  // Drawn: a label kept from its attachment atom reads towards its bond on either side, and a phenyl with its
  // positions and n- before a formula are drawn as written on both, their counts as subscripts.
  {
    const pt = 4 / 3, L = 14.4 * pt, S = { bond: L, line: 0.6 * pt, bold: 2 * pt, spacing: 0.18 * 14.4 * pt, hash: 2.5 * pt, margin: 1.69 * pt, size: 10 * pt };
    const ink = (text: string): Ink => { const w = widthOf(text, S.size), a = 0.716 * S.size; return { width: w, ascent: a, outline: [[0, 0], [w, -a]] }; };
    const drawn = (text: string, dx: number) => {
      const d = render({ atoms: [{ label: "C", location: [0, 0, 0] }, { label: "*", text, location: [dx, 0, 0] }], bonds: [{ atoms: [0, 1], type: "single" }] } as never, S, ink, L);
      return [[...d.labels].sort((a, b) => a.x - b.x).map((l) => l.text).join(""), d.labels.filter((l) => l.size < S.size * 0.9).map((l) => l.text).sort().join("")];
    };
    for (const [label, left, subs] of [["MeO", "MeO", ""], ["pinB", "pinB", ""], ["F3C", "F3C", "3"], ["t-BuO", "t-BuO", ""], ["O2N", "O2N", "2"], ["t-BuNH", "t-BuHN", ""], ["H2N", "H2N", "2"],
      ["4-ClC6H4", "4-ClC6H4", "46"], ["3,5-(CF3)2C6H3", "3,5-(CF3)2C6H3", "2336"], ["n-C8H17", "n-C8H17", "178"], ["4-ClPh", "4-ClPh", ""]]) {
      const kept = attachmentFirst(label);
      assert.deepEqual(drawn(kept, 1), [kept, subs], `${label} on the right of its bond`);
      assert.deepEqual(drawn(kept, -1), [left, subs], `${label} on the left of its bond`);
    }
  }
  // A word of any length is split in time that grows with its length (a name was once looked for again at every
  // letter, and a long word ran for seconds, then overflowed the stack): 20,000 letters in well under a second, the
  // least of three runs, and 60,000 with no error.
  for (const [first, name] of [["B", "pin"], ["O", "nBu"], ["Me", "iPr"]]) {
    let least = Infinity;
    for (let k = 0; k < 3; k++) { const t = performance.now(); labelSmiles(first + name.repeat(20000 / name.length) + k); least = Math.min(least, performance.now() - t); }
    assert.ok(least < 300, `${first}${name}${name}… of 20,000 letters: ${least.toFixed(0)} ms`);
    assert.equal(labelSmiles(first + name.repeat(60000 / name.length) + "x"), undefined);
  }
  console.log("labels.check: hyphens, labels written from the left, diolates, phenyls with positions, isotopes and stand-ins ok");
}

// The same labels as structures: each on a benzene ring is the compound written in full (its SMILES, from which the
// InChIKey is worked out, and its formula, written here by hand), and read_drawing's SMILES marks no radical on a
// group's first atom.
{
  const { readFileSync } = await import("node:fs");
  const g = globalThis as Record<string, unknown>;
  g.document = { documentElement: {}, createElement: () => ({ getContext: () => ({}) }) };
  g.getComputedStyle = () => ({ getPropertyValue: () => "10" });
  g.window = globalThis;
  g.self = { location: { origin: "file://" } };
  g.fetch = async (u: URL | string) => new Response(readFileSync(new URL(String(u))), { headers: { "content-type": "application/wasm" } });
  const { analyse, expandLabels, parseStructure, ready, toInchiKey, toSmiles } = await import("./chem.ts");
  const { problems } = await import("./check.ts");
  await ready;
  // The label on the * of a SMILES, as the AI apps' tools put it (mcp.ts read): the atom stays a *, with the label's text.
  const labelled = (smiles: string, labels: string[], charge?: number) => {
    const m = parseStructure(smiles);
    let k = 0;
    return { ...m, atoms: m.atoms.map((a) => (a.label === "*" ? { ...a, text: labels[k++], ...(charge ? { charge } : {}) } : a)) };
  };
  const formula = (m: Parameters<typeof analyse>[0]) => analyse(m)?.map((e) => e.formula).join(" + ");
  // full: the compound's formula when it is drawn as written out, where that differs: a salt written out is two
  // structures, and a salt in a label is one structure with one formula and one molar mass.
  const table: [labels: string, full: string, formula: string, full?: string][] = [
    ["Bpin BPin B(pin) pinB", "CC1(C)OB(OC1(C)C)c1ccccc1", "C12H17BO2"],
    ["CH2Bpin pinBCH2", "CC1(C)OB(Cc2ccccc2)OC1(C)C", "C13H19BO2"],
    ["OBpin pinBO", "CC1(C)OB(Oc2ccccc2)OC1(C)C", "C12H17BO3"],
    ["NHBpin", "CC1(C)OB(Nc2ccccc2)OC1(C)C", "C12H18BNO2"],
    ["9-BBN BBN", "C1CC2CCCC(C1)B2c1ccccc1", "C14H19B"],
    ["BF3K KF3B", "F[B-](F)(F)c1ccccc1.[K+]", "C6H5BF3K", "C6H5BF3 + K"],
    ["H", "c1ccccc1", "C6H6"],
    ["D T", "[2H]c1ccccc1", "C6H6"], // Octet's formulas count deuterium and tritium with hydrogen (the InChIKey tells T from D)
    ["CD3 D3C", "[2H]C([2H])([2H])c1ccccc1", "C7H8"],
    ["OD DO", "[2H]Oc1ccccc1", "C6H6O"],
    ["Allyl allyl All", "C=CCc1ccccc1", "C9H10"],
    ["Vinyl vinyl", "C=Cc1ccccc1", "C8H8"],
    ["t-Bu tBu", "CC(C)(C)c1ccccc1", "C10H14"],
    ["i-Pr iPr", "CC(C)c1ccccc1", "C9H12"],
    ["n-Bu nBu Bu", "CCCCc1ccccc1", "C10H14"],
    ["s-Bu sBu", "CCC(C)c1ccccc1", "C10H14"],
    ["n-Pr nPr Pr", "CCCc1ccccc1", "C9H12"],
    ["n-Oct nOct Oct n-C8H17 C8H17", "CCCCCCCCc1ccccc1", "C14H22"],
    ["Ot-Bu OtBu t-BuO tBuO", "CC(C)(C)Oc1ccccc1", "C10H14O"],
    ["Oi-Pr OiPr i-PrO iPrO", "CC(C)Oc1ccccc1", "C9H12O"],
    ["CO2t-Bu CO2tBu t-BuO2C", "CC(C)(C)OC(=O)c1ccccc1", "C11H14O2"],
    ["COtBu C(O)t-Bu", "CC(C)(C)C(=O)c1ccccc1", "C11H14O"],
    ["NHtBu NHt-Bu t-BuHN t-BuNH", "CC(C)(C)Nc1ccccc1", "C10H15N"],
    ["NHBoc BocHN BocNH", "CC(C)(C)OC(=O)Nc1ccccc1", "C11H15NO2"],
    ["NHAc AcHN AcNH", "CC(=O)Nc1ccccc1", "C8H9NO"],
    ["SO2Me MeO2S", "CS(=O)(=O)c1ccccc1", "C7H8O2S"],
    ["SO2CF3 F3CO2S Tf", "FC(F)(F)S(=O)(=O)c1ccccc1", "C7H5F3O2S"],
    ["CH2Ph PhCH2 Bn", "C(c1ccccc1)c1ccccc1", "C13H12"],
    ["iPrS S(iPr) i-PrS", "CC(C)Sc1ccccc1", "C9H12S"], // written from the left: S with iPr (SiPr is a silyl group)
    ["COEt EtOC C(O)Et", "CCC(=O)c1ccccc1", "C9H10O"],
    ["CONMe2 Me2NOC C(O)NMe2", "CN(C)C(=O)c1ccccc1", "C9H11NO"],
    ["SO2t-Bu S(O)2tBu", "CC(C)(C)S(=O)(=O)c1ccccc1", "C10H14O2S"],
    ["4-ClPh 4-ClC6H4 p-ClC6H4", "Clc1ccc(cc1)-c1ccccc1", "C12H9Cl"],
    ["3-FC6H4 m-FC6H4", "Fc1cccc(c1)-c1ccccc1", "C12H9F"],
    ["2-MeC6H4 o-MeC6H4", "Cc1ccccc1-c1ccccc1", "C13H12"],
    ["4-MeOC6H4 p-MeOC6H4 4-MeOPh PMP", "COc1ccc(cc1)-c1ccccc1", "C13H12O"],
    ["4-NCC6H4 4-CNC6H4", "N#Cc1ccc(cc1)-c1ccccc1", "C13H9N"],
    ["4-O2NC6H4 4-NO2C6H4", "[O-][N+](=O)c1ccc(cc1)-c1ccccc1", "C12H9NO2"],
    ["4-BocNHC6H4 4-NHBocC6H4", "CC(C)(C)OC(=O)Nc1ccc(cc1)-c1ccccc1", "C17H19NO2"],
    ["4-TBSOC6H4 4-OTBSC6H4", "CC(C)(C)[Si](C)(C)Oc1ccc(cc1)-c1ccccc1", "C18H24OSi"],
    ["4-BpinC6H4 4-pinBC6H4", "CC1(C)OB(OC1(C)C)c1ccc(cc1)-c1ccccc1", "C18H21BO2"],
    ["4-PhOC6H4", "c1ccc(cc1)Oc1ccc(cc1)-c1ccccc1", "C18H14O"],
    ["4-N3C6H4", "[N-]=[N+]=Nc1ccc(cc1)-c1ccccc1", "C12H9N3"],
    ["3,5-(MeO)2C6H3 3,5-(OMe)2C6H3", "COc1cc(OC)cc(c1)-c1ccccc1", "C14H14O2"],
    ["3,5-(NO2)2C6H3", "[O-][N+](=O)c1cc(cc(c1)[N+]([O-])=O)-c1ccccc1", "C12H8N2O4"],
    ["2,6-iPr2C6H3 2,6-i-Pr2C6H3", "CC(C)c1cccc(C(C)C)c1-c1ccccc1", "C18H22"],
    ["4-t-BuC6H4 4-tBuC6H4", "CC(C)(C)c1ccc(cc1)-c1ccccc1", "C16H18"],
    ["4-F3CC6H4 4-CF3C6H4", "FC(F)(F)c1ccc(cc1)-c1ccccc1", "C13H9F3"],
    ["4-PhC6H4", "c1ccc(cc1)-c1ccc(cc1)-c1ccccc1", "C18H14"],
    ["3,5-(CF3)2C6H3", "FC(F)(F)c1cc(cc(c1)C(F)(F)F)-c1ccccc1", "C14H8F6"],
    ["2,4,6-Me3C6H2 Mes", "Cc1cc(C)c(c(C)c1)-c1ccccc1", "C15H16"],
    ["CN", "N#Cc1ccccc1", "C7H5N"],
    ["NC", "[C-]#[N+]c1ccccc1", "C7H5N"], // the isocyanide: the bond is on N
    ["P(O)(OEt)2 PO(OEt)2 (EtO)2(O)P", "CCOP(=O)(OCC)c1ccccc1", "C10H15O3P"],
    ["P(O)Ph2 POPh2 Ph2(O)P", "O=P(c1ccccc1)(c1ccccc1)c1ccccc1", "C18H15OP"],
    ["C(O)OMe CO2Me MeO2C", "COC(=O)c1ccccc1", "C8H8O2"],
    ["C(O)Me COMe Ac", "CC(=O)c1ccccc1", "C8H8O"],
    ["CF3 F3C", "FC(F)(F)c1ccccc1", "C7H5F3"],
    ["CCl3 Cl3C", "ClC(Cl)(Cl)c1ccccc1", "C7H5Cl3"],
    ["S(O)Me", "CS(=O)c1ccccc1", "C7H8OS"],
    ["TMS SiMe3 Me3Si", "C[Si](C)(C)c1ccccc1", "C9H14Si"],
    ["TBS", "CC(C)(C)[Si](C)(C)c1ccccc1", "C12H20Si"],
    ["TIPS", "CC(C)[Si](C(C)C)(C(C)C)c1ccccc1", "C15H26Si"],
    ["NO2 O2N", "[O-][N+](=O)c1ccccc1", "C6H5NO2"],
  ];
  for (const [labels, full, want, apart] of table) for (const label of labels.split(" ")) {
    const m = labelled("*c1ccccc1", [label]), e = expandLabels(m), whole = parseStructure(label === "T" ? full.replace("[2H]", "[3H]") : full);
    assert.equal(toInchiKey(e), toInchiKey(whole), `${label} on benzene is ${full}`);
    assert.equal(formula(m), want, `${label} on benzene: formula`);
    assert.equal(formula(whole), apart ?? want, `${full}: formula`);
    assert.ok(!toSmiles(e).includes("^"), `${label} on benzene: no radical in ${toSmiles(e)}`);
    assert.deepEqual(problems(m).map((p) => p.message), [], `${label} on benzene: no warning`);
  }
  // Two deuterium labels on one carbon (the corpus's input), by the InChIKey the paper's compound has.
  assert.equal(toInchiKey(expandLabels(labelled("*C(*)(C)N", ["D", "D"]))), "QUSNBJAOOMFDIB-CBTSVUPCSA-N");
  // The borate written from the left with its charge on the atom (as any label takes one) is the borate. With no
  // charge its boron has four bonds, and Octet says so.
  assert.equal(toInchiKey(expandLabels(labelled("[*-]C[N+](C)(C)C", ["F3B"], -1))), toInchiKey(parseStructure("F[B-](F)(F)C[N+](C)(C)C")));
  assert.match(problems(labelled("*C[N+](C)(C)C", ["F3B"])).map((p) => p.message).join(" "), /F3B has 1 bond/);
  // A stand-in stays a generic atom, and so does a label Octet does not read: no formula for it, as R has none, and
  // no InChIKey for the compound.
  for (const label of ["Ar", "R", "Het", "Alkyl", "MIV", "Xyz", "OTPS", "CDI", "PDC", "BHT", "COT", "HBTU", "T3P", "CuTC", "4-OPh", "4-CH2Ph", "4-COPh", "4-NHPh", "4-SO2Ph", "3,5-NO2C6H3", "3,4,5-CF3C6H2"]) {
    const m = labelled("*Br", [label]);
    assert.equal(formula(m), "Br", label);
    assert.throws(() => toInchiKey(expandLabels(m)), label);
  }
  // A salt in a label is one compound: its molar mass is the salt's (the reagent table works amounts out from it).
  assert.ok(Math.abs(analyse(labelled("BrC*", ["BF3K"]))![0].weight - 200.83) < 0.01 && analyse(labelled("BrC*", ["BF3K"]))!.length === 1);
  // A group's first atom keeps a radical only where the label has no bond (a nitro label drawn alone is NO2•).
  assert.ok(toSmiles(expandLabels({ atoms: [{ label: "N", text: "NO2", location: [0, 0, 0] }], bonds: [] })).includes("^"));
  console.log("labels.check: corpus labels as structures ok");
}
