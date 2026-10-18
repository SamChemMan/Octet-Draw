// Run: node src/cdxml.check.ts. Fails loudly if the CDXML writer or reader breaks, loses part of a drawing, or
// accepts a bad file.
import assert from "node:assert/strict";
import { DAMAGED, NOT_CDXML, TOO_BIG, fmt, fmtAngle, fmtColour, fmtSize, fromCdxml, parseXml, toCdxml, type Xml } from "./cdxml.ts";
import { DEFAULT_STYLE, PRESETS, readStyle, type DocStyle } from "./docstyle.ts";
import { parse, serialize } from "./file.ts";
import { HIGHLIGHT, headsOf, takesHeads, tlcLayout, type Arrow, type Atom, type Bond, type Caption, type Mol, type Shape } from "./render.ts";

// Numbers as ChemDraw writes them (spec 1.2).
assert.deepEqual([fmt(30), fmt(14.4), fmt(0.6), fmt(-0.001), fmt(523.2756), fmt(2)], ["30", "14.40", "0.60", "0", "523.28", "2"]);
assert.deepEqual([fmtColour(0), fmtColour(1), fmtColour(0.6), fmtColour(0.63529)], ["0", "1", "0.6000", "0.6353"]);
assert.deepEqual([fmtAngle(-120), fmtAngle(44.63), fmtAngle(-0.01), fmtAngle(270)], ["-120", "44.6", "0", "270"]);
assert.deepEqual([fmtSize(7.5), fmtSize(10), fmtSize(9.65)], ["7.5", "10", "9.65"]);
console.log("cdxml.check: numbers ok");

// A drawing with every kind of object Octet has (coordinates in bond lengths, y up).
const A = (label: string, x: number, y: number, more: Partial<Atom> = {}): Atom => ({ label, location: [x, y, 0], ...more });
const atoms: Atom[] = [
  A("N", 0, 0, { charge: 1 }), A("C", 0.866, 0.5), A("C", 1.732, 0, { charge: -1 }), A("O", 2.598, 0.5, { radical: 1, pairs: 2, colour: "#B42323", halo: "#DCEFE6" }),
  A("O", 3.464, 0, { text: "OMe" }), A("C", 0.866, 1.5, { charge: 1, circled: true }), A("C", 0, -1, { partial: "+", hmark: "dot", map: 1, enhanced: "&1", cip: true }),
  A("C", -0.866, -1.5, { attach: true }), A("C", 0.866, -1.5, { bead: true }),
  // A second structure, the reaction's product.
  A("C", 8, 0, { map: 1, enhanced: "abs", cip: true }), A("C", 8.866, 0.5, { depth: false }), A("Cl", 9.732, 0), A("C", 8, -1, { text: "Ph" }), A("D", 8.866, -1.5),
  A("C", 7.134, 0.5, { text: "R1" }), A("C", 8.866, 1.5, { text: "CO2Et", hmark: "dash", enhanced: "or2" }),
  // A ring for the catalytic cycle and the bond styles.
  A("C", 20, 1), A("C", 20.866, 0.5), A("C", 20.866, -0.5), A("C", 20, -1), A("C", 19.134, -0.5), A("C", 19.134, 0.5),
  // Lone atoms: water, methane and an amide anion.
  A("O", 0, -8), A("C", 3, -8), A("N", 6, -8, { charge: -1 }),
];
atoms[10].location[2] = 0.5;
const b = (i: number, j: number, more: Partial<Bond> = {}): Bond => ({ type: 1, atoms: [i, j], ...more });
const bonds: Bond[] = [
  b(0, 1), b(1, 2, { type: 2, position: "left" }), b(2, 3, { stereo: 1 }), b(3, 4), b(1, 5, { colour: "#213C99" }), b(0, 6, { stereo: 6 }), b(6, 7, { display: "wavy" }), b(6, 8, { display: "bold" }),
  b(9, 10, { type: 2, display: "bold" }), b(10, 11, { display: "dashed" }), b(9, 12, { display: "hashed" }), b(12, 13), b(9, 14, { display: "dative" }), b(10, 15, { type: 2, display: "either" }),
  b(16, 17, { display: "hollow" }), b(17, 18, { type: 3 }), b(18, 19, { type: 2, position: "right" }), b(19, 20, { type: 2, position: "centre", display: "dashed" }), b(20, 21), b(21, 16, { type: 2, colour: "#22775B" }),
];
const captions: Caption[] = [
  { id: 1, text: "Plain caption", x: 0, y: 4 },
  { id: 2, text: "Line one\nLine two", x: -2, y: 6, bold: true, italic: true, underline: true, size: 12, colour: "#213C99", font: "Times New Roman", align: "left" },
  {
    id: 3, text: "K2CO3, H2O (aq)+", x: 4, y: 5, runs: [{ text: "K" }, { text: "2", script: "sub" }, { text: "CO" }, { text: "3", script: "sub" }, { text: ", " }, { text: "H", bold: true },
      { text: "2", script: "sub", bold: true }, { text: "O (aq)", italic: true, colour: "#B42323", font: "Georgia", size: 8 }, { text: "+", script: "super" }],
  },
  { id: 4, text: "1", x: 0, y: 0, bold: true, under: [9, 10, 11] },
  { id: 5, text: "hν", x: 0, y: 0, on: { arrow: 101, side: "above" } },
  { id: 6, text: "DMF, 80 °C\n12 h", x: 0, y: 0, on: { arrow: 101, side: "below" } },
  { id: 7, text: "ArB(OH)2", x: 23, y: 3, cycle: { cycle: 300, step: 0, side: "in" } },
  { id: 8, text: `a < b & "c" 'd' > e`, x: 2, y: -6, align: "right" },
];
const arrow = (id: number, kind: Arrow["kind"], from: [number, number], to: [number, number], more: Partial<Arrow> = {}): Arrow => ({ id, kind, from, to, ...more });
const arrows: Arrow[] = [
  arrow(101, "reaction", [4.5, 0], [6.5, 0]), arrow(102, "equilibrium", [0, -4], [3, -4]), arrow(103, "resonance", [4, -4], [7, -4]), arrow(104, "retro", [8, -4], [11, -4]),
  arrow(105, "nogo", [12, -4], [15, -4]), arrow(106, "curved", [0, -12], [2, -12], { bend: 0.3 }), arrow(107, "fishhook", [3, -12], [5, -12], { bend: -0.4 }),
  arrow(108, "fishhook", [6, -12], [8, -12], { bend: 0.25, end: "right" }), arrow(109, "double", [9, -12], [11, -12], { bend: 0.5, colour: "#8B4E18" }),
  arrow(110, "line", [12, -12], [14, -11], { start: "full", end: "left", style: "dashed", head: "hollow", colour: "#3F6BFF" }), arrow(111, "arc", [15, -12], [17, -12], { bend: -0.2, style: "wavy" }),
  arrow(112, "orbital", [0, -16], [0.8, -16], { orbital: { shape: "p", phase: "filled" } }), arrow(113, "orbital", [2, -16], [2.8, -16], { orbital: { shape: "hybrid", phase: "phased" } }),
  arrow(114, "orbital", [4, -16], [4, -15.2], { orbital: { shape: "dz2", phase: "plain" } }), arrow(115, "orbital", [6, -16], [6.8, -16], { orbital: { shape: "s", phase: "shaded" } }),
  arrow(116, "orbital", [8, -16], [8.8, -16.4], { orbital: { shape: "d", phase: "filled" }, colour: "#B42323" }), arrow(117, "orbital", [10, -16], [10.8, -16], { orbital: { shape: "oval", phase: "plain" } }),
  arrow(118, "cut", [12, -16], [12, -14]),
  arrow(119, "curve", [0, -20], [3, -20], { curve: { points: [{ at: [0, -20], c2: [1, -19] }, { at: [2, -21], c1: [1.5, -21.5], c2: [2.5, -20.5] }, { at: [3, -20] }] }, end: "full", start: "left", style: "bold" }),
  arrow(120, "curve", [4, -20], [4.5, -19], { curve: { points: [{ at: [4, -20] }, { at: [5, -20] }, { at: [4.5, -19] }], closed: true }, fill: "solid", colour: "#22775B" }),
  arrow(121, "curve", [6, -20], [6.5, -19], { curve: { points: [{ at: [6, -20], c1: [5.8, -20.5], c2: [6.2, -19.5] }, { at: [7, -20] }, { at: [6.5, -19] }], closed: true }, fill: "shaded", style: "dashed" }),
  arrow(122, "curve", [8, -20], [8.5, -19], { curve: { points: [{ at: [8, -20] }, { at: [9, -20] }, { at: [8.5, -19] }], closed: true }, fill: "faded", style: "doubled" }),
  arrow(123, "curve", [10, -20], [11, -20], { curve: { points: [{ at: [10, -20] }, { at: [11, -20] }] }, style: "wavy", end: "full", head: "angled" }),
  arrow(124, "reaction", [12, -20], [15, -20], { style: "bold" }), arrow(125, "curved", [16, -20], [18, -20]), arrow(126, "reaction", [19, -20], [21, -20], { start: "full", end: "none" }),
];
const shapes: Shape[] = [
  { id: 201, kind: "highlight", from: [-1, -1], to: [3.5, 1.5] },
  { id: 202, kind: "box", from: [30, 0], to: [32, 2], dashed: true },
  { id: 203, kind: "rounded", from: [33, 2], to: [36, 0], fill: "shaded", shadow: true, shade: { depth: 0.2, blur: 0.1, opacity: 0.5 } },
  { id: 204, kind: "oval", from: [37, 0], to: [39, 2], fill: "solid", colour: "#213C99" },
  { id: 205, kind: "oval", from: [40, 0], to: [43, 1.5], shadow: true },
  { id: 206, kind: "brackets", from: [30, -6], to: [33, -3], mark: "‡", dashed: true, colour: "#B42323" },
  { id: 207, kind: "parens", from: [34, -6], to: [36, -3], side: "left" },
  { id: 208, kind: "braces", from: [37, -6], to: [39.5, -3], side: "right", mark: "n" },
  {
    id: 209, kind: "tlc", from: [30, -16], to: [34, -10], colour: "#3F6BFF", tlc: {
      lanes: 3, rf: true, origin: 0.2, front: 0.15, hide: ["front"],
      spots: [{ lane: 2, rf: 0.7, colour: "#B42323" }, { lane: 0, rf: 0.3, style: "hollow", w: 0.3, h: 0.2 }, { lane: 1, rf: 0.5, style: "shaded", tail: 0.4, showRf: true }, { lane: 0, rf: 0.9 }],
    },
  },
  { id: 210, kind: "tlc", from: [35, -16], to: [37, -10], tlc: { lanes: 1, spots: [{ lane: 0, rf: 0.5 }] } },
  { id: 211, kind: "table", from: [40, -16], to: [46, -12], dashed: true, colour: "#213C99", table: { cells: [["Entry", "Yield"], ["1", "72%"], ["2", "n.d."]], lines: ["top", "header", "bottom", "cols"], align: ["left", "right"], widths: [2.5, 3], heights: [1, 1.2, 1], weight: 0.8 } },
  { id: 212, kind: "highlight", from: [7, -2], to: [10, 2], colour: "#DCEFE6" },
  { id: 213, kind: "box", from: [40, 3], to: [42, 5], fill: "solid", colour: "#FFFFFF" },
];
const drawing: Mol = {
  atoms, bonds, captions, arrows, shapes,
  cycles: [{ id: 300, centre: [20, 0], radius: 3, clockwise: false, nodes: [[16, 17], [18], [19, 20]], colour: "#8B4E18" }],
  groups: [{ id: 400, atoms: [9, 10, 11, 12, 13, 14, 15], items: [5, 106] }, { id: 401, atoms: [], items: [202, 203], integral: true }],
};

// What a drawing means, written the same way whatever form it was set in: corners as low and high, heads and
// spot sizes that equal the defaults left unset, explicit black as the default ink, centred as unset.
function canon(m: Mol): Mol {
  const ink = (c?: string) => (c && c.toUpperCase() !== "#000000" ? c.toUpperCase() : undefined);
  const strip = <T extends object>(o: T): T => JSON.parse(JSON.stringify(o));
  return strip({
    atoms: m.atoms.map((a) => ({ ...a, colour: ink(a.colour), halo: ink(a.halo) })),
    bonds: m.bonds.map((x) => ({ ...x, colour: ink(x.colour) })),
    captions: [...(m.captions ?? [])].sort((p, q) => p.id - q.id).map((c) => ({ ...c, align: c.align === "centre" ? undefined : c.align, colour: ink(c.colour) })),
    arrows: [...(m.arrows ?? [])].sort((p, q) => p.id - q.id).map((a) => {
      const own = headsOf({ kind: a.kind, bend: a.bend }), heads = takesHeads(a);
      return { ...a, colour: ink(a.colour), start: heads && a.start !== own.start ? a.start : undefined, end: heads && a.end !== own.end ? a.end : undefined, head: heads && a.head !== "solid" ? a.head : undefined };
    }),
    shapes: (m.shapes ?? []).map((s) => {
      const t = s.tlc && tlcLayout(s);
      return {
        ...s, from: [Math.min(s.from[0], s.to[0]), Math.min(s.from[1], s.to[1])], to: [Math.max(s.from[0], s.to[0]), Math.max(s.from[1], s.to[1])],
        colour: s.kind === "highlight" && s.colour === HIGHLIGHT ? undefined : ink(s.colour),
        tlc: s.tlc && { ...s.tlc, hide: s.tlc.hide && [...s.tlc.hide].sort(), spots: s.tlc.spots.map((x) => ({ ...x, w: x.w === t!.size({ lane: x.lane, rf: x.rf }).rx ? undefined : x.w })) },
      };
    }),
    cycles: m.cycles ?? [], groups: (m.groups ?? []).map((g) => ({ ...g, atoms: [...g.atoms].sort((p, q) => p - q), items: [...g.items].sort((p, q) => p - q) })),
  });
}
// Paths where two drawings differ; numbers agree to 0.0015 bond lengths (CDXML holds 0.01 pt).
function differences(a: unknown, b: unknown, path = "", out: string[] = []): string[] {
  if (typeof a === "number" && typeof b === "number") { if (Math.abs(a - b) > 1.5e-3) out.push(`${path}: ${a} vs ${b}`); }
  else if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) a.forEach((x, k) => differences(x, b[k], `${path}[${k}]`, out));
  else if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) differences((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}.${k}`, out);
  } else if (JSON.stringify(a) !== JSON.stringify(b)) out.push(`${path}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
  return out;
}
const same = (a: Mol, b: Mol, what: string) => { const d = differences(canon(a), canon(b)); assert.equal(d.length, 0, `${what}:\n${d.slice(0, 20).join("\n")}`); };

// Every object kind survives a write and a read, the result passes Octet's own file checks, and once saved a
// drawing saves to the same file every time (coordinates settle on CDXML's 0.01 pt grid and stay there).
const style: DocStyle = readStyle({ ...DEFAULT_STYLE, ...PRESETS.RSC, page: "Letter", landscape: true, edges: false, grid: 5, background: "dark", colour: "#0F172A" });
const text = toCdxml(drawing, style, { name: "check.cdxml" });
const back = fromCdxml(text);
same(drawing, back.mol, "round trip");
assert.deepEqual(back.style, style);
assert.deepEqual(back.lost, {});
parse(serialize(back.mol));
const second = toCdxml(back.mol, back.style, { name: "check.cdxml" }), third = fromCdxml(second);
assert.equal(toCdxml(third.mol, third.style, { name: "check.cdxml" }), second, "after one save, saving again changes nothing");
console.log("cdxml.check: every object kind round trips");

// The file is laid out as ChemDraw writes it: the two header lines, the root's ACS settings, tables, then the page.
{
  const acs = toCdxml(drawing, DEFAULT_STYLE);
  assert.ok(acs.startsWith('<?xml version="1.0" encoding="UTF-8" ?>\n<!DOCTYPE CDXML SYSTEM "http://www.cambridgesoft.com/xml/cdxml.dtd" >\n<CDXML\n CreationProgram='));
  for (const a of ['BondLength="14.40"', 'LineWidth="0.60"', 'BoldWidth="2"', 'HashSpacing="2.50"', 'MarginWidth="1.60"', 'BondSpacing="18"', 'LabelFace="96"', 'WindowSize="0 0"', 'ChemPropHenry="Henry&apos;s Law: "'])
    assert.ok(acs.includes(a), a);
  assert.ok(/><colortable>\n<color r="1" g="1" b="1"\/>\n<color r="0" g="0" b="0"\/>\n<color r="1" g="0" b="0"\/>/.test(acs), "ChemDraw's colour table start");
  assert.ok(acs.indexOf("<fonttable>") < acs.indexOf("<page"), "fonts before the page");
  const root = parseXml(acs), all: Xml[] = [];
  const walk = (x: Xml) => { all.push(x); x.kids.forEach(walk); };
  walk(root);
  const ids = all.filter((x) => x.name !== "font").map((x) => x.attrs.id).filter(Boolean);
  assert.equal(new Set(ids).size, ids.length, "ids are unique (font ids are their own)");
  // Every arrow has its legacy copy, and every step names the copy (spec 11).
  const legacy = all.filter((x) => x.attrs.SupersededBy);
  assert.equal(legacy.length, all.filter((x) => x.name === "arrow").length);
  for (const s of all.filter((x) => x.name === "step")) assert.ok(legacy.some((g) => g.attrs.id === s.attrs.ReactionStepArrows));
  // The reaction: drawing 1 to drawing 2 over arrow 101, with its conditions and the mapped atoms.
  const step = all.find((x) => x.name === "step" && x.attrs.ReactionStepReactants)!;
  assert.ok(step.attrs.ReactionStepProducts && step.attrs.ReactionStepObjectsAboveArrow === "5" && step.attrs.ReactionStepObjectsBelowArrow === "6" && step.attrs.ReactionStepAtomMapManual);
  console.log("cdxml.check: layout ok");
}

// Another page and style, and only part of a drawing (the clipboard).
{
  const custom = readStyle({ ...DEFAULT_STYLE, page: "Custom", custom: [180.5, 120.25] });
  assert.deepEqual(fromCdxml(toCdxml({ atoms: [], bonds: [] }, custom)).style, custom);
  const part = fromCdxml(toCdxml(drawing, DEFAULT_STYLE, { selection: { atoms: [0, 1, 2, 9], items: [1, 5, 101, 106] } })).mol;
  assert.deepEqual([part.atoms.length, part.bonds.length, part.captions?.map((c) => c.id), part.arrows?.map((a) => a.id)], [4, 2, [1, 5], [101, 106]]);
  assert.equal(part.captions?.[1].on?.arrow, 101);
  // Arrows Octet derives (a cycle's) are written for ChemDraw and skipped when Octet reads its own file.
  const derived: Arrow = { id: -5, kind: "curved", from: [17, 0], to: [20, 3], bend: 0.2 };
  const withDerived = toCdxml(drawing, DEFAULT_STYLE, { derived: [derived] });
  const count = (xml: string) => xml.split("<arrow\n").length - 1;
  assert.equal(count(withDerived), count(toCdxml(drawing, DEFAULT_STYLE)) + 1);
  same(drawing, fromCdxml(withDerived).mol, "derived arrows");
  // A label Octet can expand goes to ChemDraw as an abbreviation with its own atoms; Octet keeps the label.
  const phenyl: Mol = { atoms: [0, 1, 2, 3, 4, 5].map((k) => A("C", Math.cos((k * Math.PI) / 3), Math.sin((k * Math.PI) / 3))), bonds: [0, 1, 2, 3, 4, 5].map((k) => b(k, (k + 1) % 6, { type: k % 2 ? 1 : 2 })) };
  const expanded = toCdxml(drawing, DEFAULT_STYLE, { expand: (t) => (t === "Ph" ? phenyl : undefined) });
  assert.ok(expanded.includes('NodeType="Fragment"') && expanded.includes('NodeType="ExternalConnectionPoint"'));
  same(drawing, fromCdxml(expanded).mol, "expanded labels");
  console.log("cdxml.check: selection, derived arrows and abbreviations ok");
}

// A file in ChemDraw's own form (written here by hand): legacy copies skipped for their arrows, legacy graphics on
// their own read as arrows, abbreviations, charges and radicals as symbols, groups, steps and formula text.
{
  const file = `<?xml version="1.0" encoding="UTF-8" ?>
<!DOCTYPE CDXML SYSTEM "http://www.cambridgesoft.com/xml/cdxml.dtd" >
<CDXML BondLength="14.40" LineWidth="0.60" BoldWidth="2" MarginWidth="1.60" HashSpacing="2.50" BondSpacing="18" LabelFont="3" LabelSize="10" LabelFace="96" CaptionFont="3" CaptionSize="10" color="0" bgcolor="1"
><colortable><color r="1" g="1" b="1"/><color r="0" g="0" b="0"/><color r="1" g="0" b="0"/></colortable
><fonttable><font id="3" charset="x-mac-roman" name="Arial"/><font id="4" charset="x-mac-roman" name="Arial Bold Italic"/></fonttable
><page id="1" BoundingBox="0 0 540 720" WidthPages="1" HeightPages="1"
><group id="2" Z="20"><fragment id="3" Z="10"
><n id="4" p="270 360" Z="1"/><n id="5" p="282.47 367.2" Z="2" Element="7" NumHydrogens="3" Charge="1"><t p="278.86 370.78" LabelJustification="Left"><s font="3" size="10" face="96">NH3+</s></t></n
><n id="6" p="257.53 367.2" Z="3" NodeType="Nickname"><fragment id="7"><n id="8" p="257.53 367.2"/><n id="9" p="270 360" NodeType="ExternalConnectionPoint"/><b id="10" B="9" E="8"/></fragment
><t p="261.42 370.78" LabelJustification="Right" Justification="Right"><s font="3" size="10" face="96">Me</s></t></n
><n id="11" p="270 345.6" Z="4" Element="8" Radical="Doublet"><t p="266.11 349.24" LabelJustification="Left"><s font="3" size="10" face="96">O</s></t></n
><b id="12" Z="5" B="4" E="5"/><b id="13" Z="6" B="4" E="6" Display="WedgeEnd"/><b id="14" Z="7" B="4" E="11" Order="2"/><b id="40" B="4" E="99"/>
<graphic id="15" BoundingBox="276 338 268.5 338" Z="8" GraphicType="Symbol" SymbolType="Electron"><represent attribute="Radical" object="11"/></graphic
><graphic id="16" BoundingBox="290 360 282.5 360" Z="9" GraphicType="Symbol" SymbolType="CirclePlus"><represent attribute="Charge" object="5"/></graphic
><graphic id="17" BoundingBox="262 340 254.5 340" GraphicType="Symbol" SymbolType="LonePair"/></fragment
><t id="18" p="270 400" Z="11" CaptionJustification="Center" Justification="Center"><s font="4" size="10" face="3">1</s></t></group
><t id="19" p="340 350" Z="12" CaptionJustification="Center" Justification="Center"><s font="3" size="10" face="96">CH2Cl2</s></t
><t id="20" p="340 375" Z="13">text outside runs is dropped<s font="3" size="10">rt, </s><s font="3" size="10" color="4">24&#10;h</s></t
><t id="21" p="0 0" Visible="no"><s font="3" size="10">hidden</s></t
><graphic id="22" SupersededBy="23" BoundingBox="380 360 300 360" Z="14" GraphicType="Line" ArrowType="FullHead"/>
<graphic id="24" BoundingBox="200 300 180 300" Z="15" GraphicType="Line" ArrowType="Equilibrium"/>
<graphic id="25" BoundingBox="400 200 380 200" Z="16" GraphicType="Arc" ArrowType="FullHead" AngularSize="-90"/>
<graphic id="26" BoundingBox="100 100 50 60" Z="17" GraphicType="Rectangle" RectangleType="RoundEdge Shadow" CornerRadius="600" ShadowSize="400"/>
<graphic id="27" BoundingBox="150 100 130 100" Z="18" GraphicType="Oval" OvalType="Circle Filled" color="4"/>
<graphic id="28" BoundingBox="200 140 200 100" Z="19" GraphicType="Bracket" BracketType="Square"/>
<graphic id="29" BoundingBox="240 100 240 140" Z="20" GraphicType="Bracket" BracketType="Square"/>
<graphic id="30" BoundingBox="310 420 300 420" Z="21" GraphicType="Orbital" OrbitalType="pShaded"/>
<curve id="31" Z="22" FillType="Solid" CurveType="129" ArrowheadType="Solid" Closed="yes" CurvePoints="10 10 10 10 20 10 30 10 30 10 30 10 30 30 30 30 30 30"/>
<embeddedobject id="32" BoundingBox="0 0 10 10" PNG="89504E47"/>
<arrow id="23" Z="14" FillType="None" ArrowheadHead="Full" ArrowheadType="Solid" HeadSize="1000" ArrowheadCenterSize="875" ArrowheadWidth="250" Head3D="380 360 0" Tail3D="300 360 0" Center3D="300 360 0" MajorAxisEnd3D="380 360 0" MinorAxisEnd3D="300 440 0"/>
<arrow id="33" Z="23" ArrowheadHead="Full" ArrowheadType="Solid" AngularSize="90" Head3D="450 280 0" Tail3D="470 300 0" Center3D="450 300 0" MajorAxisEnd3D="470 300 0" MinorAxisEnd3D="450 320 0"/>
<scheme id="34"><step id="35" ReactionStepReactants="3" ReactionStepArrows="22" ReactionStepObjectsAboveArrow="19" ReactionStepObjectsBelowArrow="20"/></scheme>
</page></CDXML>`;
  const { mol, style: s, lost } = fromCdxml(file);
  assert.equal(s.page, "Letter");
  assert.deepEqual(lost, { picture: 1, "hidden object": 1, bond: 1 });
  assert.deepEqual(mol.atoms.map((a) => [a.label, a.text, a.charge, a.radical, a.pairs, a.circled]), [["C", undefined, undefined, undefined, undefined, undefined], ["N", undefined, 1, undefined, undefined, true], ["C", "Me", undefined, undefined, undefined, undefined], ["O", undefined, undefined, 1, 1, undefined]]);
  assert.deepEqual(mol.atoms[0].location, [0, 0, 0]);
  assert.deepEqual(mol.bonds.map((x) => [x.type, x.atoms, x.stereo]), [[1, [0, 1], undefined], [1, [2, 0], 1], [2, [0, 3], undefined]]);
  const [one, solvent, conditions] = mol.captions!;
  assert.deepEqual([one.text, one.bold, one.italic, one.font, one.align], ["1", true, true, undefined, undefined]);
  assert.deepEqual(solvent.runs?.map((r) => [r.text, r.script]), [["CH", undefined], ["2", "sub"], ["Cl", undefined], ["2", "sub"]]);
  assert.deepEqual([conditions.text, conditions.align, conditions.runs?.[1]], ["rt, 24\nh", "left", { text: "24\nh", colour: "#FF0000" }]);
  // Arrows in reading order: the graphics (legacy ones on their own), the curve, then the arrows.
  assert.deepEqual(mol.arrows!.map((a) => a.kind), ["equilibrium", "curved", "orbital", "curve", "reaction", "curved"]);
  const [equilibrium, legacyArc, orbital, curve, reaction, arc] = mol.arrows!;
  assert.deepEqual([solvent.on, conditions.on], [{ arrow: reaction.id, side: "above" }, { arrow: reaction.id, side: "below" }]);
  assert.deepEqual([reaction.from, reaction.to], [[30 / 14.4, 0], [110 / 14.4, 0]]);
  assert.deepEqual([equilibrium.from, equilibrium.to].map((p) => p.map((v) => +v.toFixed(3))), [[-90 / 14.4, 60 / 14.4].map((v) => +v.toFixed(3)), [-70 / 14.4, 60 / 14.4].map((v) => +v.toFixed(3))]);
  // The legacy arc's tail is its head turned back by its sweep; both arcs bow to the outside of their circle.
  assert.ok(Math.hypot(legacyArc.from[0] - 110 / 14.4, legacyArc.from[1] - 180 / 14.4) < 1e-9 && legacyArc.bend! > 0 && arc.bend! < 0 && Math.abs(Math.abs(arc.bend!) - 0.2071) < 1e-3);
  assert.deepEqual(orbital.orbital, { shape: "p", phase: "shaded" });
  assert.deepEqual([curve.curve!.points.length, curve.curve!.closed, curve.fill, !!curve.curve!.points[0].c2, !!curve.curve!.points[1].c1], [3, true, "solid", true, false]);
  assert.deepEqual(mol.shapes!.map((x) => [x.kind, x.fill, x.shadow, x.side, x.colour]), [["rounded", undefined, true, undefined, undefined], ["oval", "solid", undefined, undefined, "#FF0000"], ["brackets", undefined, undefined, undefined, undefined]]);
  assert.deepEqual(mol.groups!.map((g) => [g.atoms, g.items]), [[[0, 1, 2, 3], [one.id]]]);
  parse(serialize(mol));
  console.log("cdxml.check: ChemDraw's form read");
}

// Hostile files are refused with a message, or read with the bad parts left out; nothing is expanded or fetched.
{
  const refused: [string, string][] = [
    ["not a drawing", NOT_CDXML], ['{"format":"octet"}', NOT_CDXML], ['<?xml version="1.0"?><svg/>', NOT_CDXML], ["<!-- <CDXML --><svg/>", NOT_CDXML],
    ["<CDXML><page></CDXML>", DAMAGED], ['<CDXML a="1" a="2"/>', DAMAGED], [`<CDXML>${"<group>".repeat(80)}${"</group>".repeat(80)}</CDXML>`, DAMAGED],
    ['<CDXML><page><t p="0 0"><s font="3">&#0;</s></t></page></CDXML>', DAMAGED], ['<CDXML><page><t p="0 0"><s>a & b</s></t></page></CDXML>', DAMAGED],
    ["<CDXML><!-- open", DAMAGED], ["<CDXML/>junk", DAMAGED], ["<CDXML/><CDXML/>", DAMAGED], ['<CDXML><page id="1></page></CDXML>', DAMAGED], ["<CDXML><page", DAMAGED],
    [`<CDXML>${" ".repeat(64 * 1024 * 1024)}</CDXML>`, TOO_BIG], [`<CDXML><page><fragment>${'<n p="0 0"/>'.repeat(100_001)}</fragment></page></CDXML>`, TOO_BIG],
  ];
  for (const [file, message] of refused) assert.throws(() => fromCdxml(file), (e: Error) => e.message === message, file.slice(0, 60));
  // Entity tricks: declared entities are never expanded, external ones never fetched.
  const laughs = `<?xml version="1.0"?><!DOCTYPE CDXML [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;"><!ENTITY c "&b;&b;&b;&b;&b;&b;&b;&b;&b;&b;"><!ENTITY x SYSTEM "file:///etc/passwd">]>
<CDXML __proto__="x" constructor="y"><page><t p="0 0"><s font="3" size="10">&c;&x;ok</s></t></page></CDXML>`;
  const read = fromCdxml(laughs);
  assert.equal(read.mol.captions?.[0].text, "ok");
  assert.equal(({} as Record<string, unknown>).x, undefined);
  // Bad numbers, ids and references: those objects are dropped and counted, the rest read.
  const bad = fromCdxml(`<CDXML><page><fragment><n id="1" p="NaN 0"/><n id="2" p="1e999 0"/><n id="3" p="10 10" Charge="99" Element="999"/><n id="4" p="20 10"/><b B="3" E="7"/><b B="3" E="3"/><b B="3" E="4"/><b B="4" E="3"/></fragment>
<t p="0 0"><s font="3" size="500">a\u0001b\tc</s></t><arrow id="9" Head3D="x"/><curve CurvePoints="1 2 3"/><graphic GraphicType="Rectangle" BoundingBox="0 0"/><unknownthing/></page></CDXML>`);
  assert.deepEqual([bad.mol.atoms.length, bad.mol.bonds.length, bad.mol.atoms[0].label, bad.mol.atoms[0].charge], [2, 1, "C", undefined]);
  assert.deepEqual(bad.mol.captions?.map((c) => [c.text, c.size]), [["ab c", 144]]);
  assert.deepEqual(bad.lost, { atom: 2, charge: 1, bond: 3, arrow: 1, curve: 1, graphic: 1, unknownthing: 1 });
  parse(serialize(bad.mol));
  // Octet's own data is checked like the rest: wrong kinds, types and sizes are ignored.
  const forged = fromCdxml(`<CDXML Octet='{"v":1,"page":"Moon","custom":"x","cycles":[{"id":"x"},{"id":7,"centre":[0,0],"radius":-1,"nodes":[[1],[2]]}]}'><page>
<fragment><n id="1" p="0 0" Octet='{"map":-5,"hmark":"evil","partial":7,"depth":true}'/><n id="2" p="14 0"/></fragment>
<t id="3" p="0 0" Octet='{"under":[1e99,"x"],"xy":["a",1],"cycle":{"cycle":7,"step":99}}'><s font="1" size="10">x</s></t>
<arrow id="4" Head3D="1 1 0" Tail3D="0 0 0" Center3D="0 0 0" Octet='{"kind":"teleport","style":"glitter"}'/>
<graphic id="5" GraphicType="Orbital" BoundingBox="1 1 0 0" Octet='{"orbital":{"shape":"z","phase":"q"}}'/>
<graphic id="6" GraphicType="Rectangle" BoundingBox="0 0 10 10" Octet='{"shade":{"depth":99,"blur":0,"opacity":1},"kind":"highlight"}'/>
<group id="8" BoundingBox="0 0 10 10" Octet='{"kind":"table","table":{"cells":"x"}}'/>
<graphic id="9" GraphicType="Bracket" BracketType="Square" BoundingBox="0 10 0 0" Octet='{"mark":"far too long a mark","span":[1e99,0]}'/>
</page></CDXML>`);
  assert.deepEqual(forged.mol.atoms[0], { label: "C", location: [-270 / 14.4, 360 / 14.4, 0] });
  assert.equal(forged.mol.cycles, undefined);
  assert.deepEqual([forged.mol.arrows?.map((a) => a.kind), forged.mol.shapes?.map((x) => x.kind)], [["line", "orbital"], ["highlight", "brackets"]]);
  assert.deepEqual([forged.mol.captions?.[0].under, forged.mol.captions?.[0].cycle, forged.style.page], [undefined, undefined, "A4"]);
  assert.deepEqual(forged.lost, { table: 1 });
  parse(serialize(forged.mol));
  console.log("cdxml.check: hostile files refused or read safely");
}

// Atom Properties and the newer marks: an isotope, a singlet radical (a carbene), aromatic circles and a reaction's
// stoichiometry grid come back from Octet's own CDXML.
{
  const ring = [0, 1, 2, 3, 4, 5].map((k) => A("C", Math.cos((k * Math.PI) / 3), Math.sin((k * Math.PI) / 3), { circle: true }));
  const m: Mol = {
    atoms: [...ring, A("C", 2, 0, { isotope: 13 }), A("C", 6, 0, { radical: 3 }), A("N", 3, -3, { isotope: 15, charge: 1 })],
    bonds: [...ring.map((_, k) => b(k, (k + 1) % 6, { type: k % 2 ? 1 : 2 })), b(0, 6)],
    arrows: [{ id: 40, kind: "reaction", from: [3, 0], to: [5, 0] }],
    grids: [{ arrow: 40, typed: { r0: { mass: 1.06, purity: 0.98 }, p0: { measured: 0.9 } }, limiting: "r0" }],
  };
  const back = fromCdxml(toCdxml(m, DEFAULT_STYLE)).mol;
  assert.deepEqual(back.atoms.map((a) => [a.label, a.isotope, a.radical, a.circle, a.charge]),
    m.atoms.map((a) => [a.label, a.isotope, a.radical, a.circle, a.charge]), "isotope, singlet radical and ring circles");
  assert.equal(back.atoms[7].pairs, undefined, "a singlet's pair is its radical, not a lone pair");
  assert.deepEqual(back.grids, [{ arrow: back.arrows![0].id, typed: m.grids![0].typed, limiting: "r0" }], "stoichiometry grid");
  // ChemDraw's form of an isotope: Isotope on the node and the mass number in the label's text.
  const cd = `<?xml version="1.0" encoding="UTF-8" ?><CDXML><page id="1"><fragment id="2"><n id="3" p="100 100" Element="6" Isotope="14" NumHydrogens="4"><t p="96 104"><s font="3" size="10" face="96">14CH4</s></t></n></fragment></page></CDXML>`;
  const r = fromCdxml(cd);
  assert.deepEqual([r.mol.atoms[0].label, r.mol.atoms[0].isotope, r.mol.atoms[0].text, r.lost], ["C", 14, undefined, {}], "ChemDraw's ¹⁴CH₄");
  console.log("cdxml.check: isotopes, singlet radicals, ring circles and grids ok");
}

// Atom numbers and the document's label options, and ChemDraw's CH3 labels read back as plain carbons.
{
  const m: Mol = { atoms: [A("C", 0, 0, { number: "1" }), A("C", 0.866, 0.5, { number: "2" }), A("O", 1.732, 0)], bonds: [b(0, 1), b(1, 2)] };
  const s = { ...DEFAULT_STYLE, terminalLabels: true, carbonLabels: false, hideH: false };
  const text = toCdxml(m, s);
  assert.match(text, /ShowTerminalCarbonLabels="yes"/);
  assert.match(text, />CH3</, "the terminal carbon's label is written");
  const back = fromCdxml(text);
  assert.deepEqual(back.mol.atoms.map((a) => [a.label, a.text, a.number]), [["C", undefined, "1"], ["C", undefined, "2"], ["O", undefined, undefined]]);
  assert.deepEqual([back.style.terminalLabels, back.style.carbonLabels, back.style.hideH, back.lost], [true, false, false, {}]);
  console.log("cdxml.check: atom numbers and label options ok");
}

// ChemDraw's delocalised rings (bonds of order 1.5, a circle oval inside the ring) and its DoubleDashed bond (order 1.5,
// second line dashed), written and read.
{
  // A ring of n atoms at the origin, bond length 14.4 pt, with optional labels and hydrogens, as ChemDraw writes it.
  const ring = (n: number, labels: Record<number, [number, number?]> = {}, circle = true, extra = "") => {
    const R = 14.4 / (2 * Math.sin(Math.PI / n)), nodes = Array.from({ length: n }, (_, k) => {
      const [el, h] = labels[k] ?? [6];
      return `<n id="${k + 1}" p="${(200 + R * Math.cos((2 * Math.PI * k) / n)).toFixed(2)} ${(200 + R * Math.sin((2 * Math.PI * k) / n)).toFixed(2)}"${el !== 6 ? ` Element="${el}"` : ""}${h !== undefined ? ` NumHydrogens="${h}"` : ""}/>`;
    }).join("");
    const bonds = Array.from({ length: n }, (_, k) => `<b id="${100 + k}" B="${k + 1}" E="${((k + 1) % n) + 1}" Order="1.5"/>`).join("");
    const oval = circle ? `<graphic id="300" BoundingBox="${(200 + 0.62 * R).toFixed(2)} 200 200 200" GraphicType="Oval" OvalType="Circle" Center3D="200 200 0" MajorAxisEnd3D="${(200 + 0.62 * R).toFixed(2)} 200 0" MinorAxisEnd3D="200 ${(200 + 0.62 * R).toFixed(2)} 0"/>` : "";
    return `<?xml version="1.0" encoding="UTF-8" ?><CDXML BondLength="14.40"><page id="1"><fragment id="2">${nodes}${bonds}${oval}${extra}</fragment></page></CDXML>`;
  };
  const doubles = (m: Mol) => m.bonds.filter((x) => x.type === 2).length;
  const benzene = fromCdxml(ring(6)).mol;
  assert.deepEqual([doubles(benzene), benzene.atoms.every((a) => a.circle), benzene.shapes, benzene.atoms.every((_, i) => benzene.bonds.filter((x) => x.type === 2 && x.atoms.includes(i)).length === 1)], [3, true, undefined, true], "benzene with its circle");
  assert.equal(doubles(fromCdxml(ring(6, { 0: [7] })).mol), 3, "pyridine");
  const pyrrole = fromCdxml(ring(5, { 0: [7, 1] })).mol;
  assert.deepEqual([doubles(pyrrole), pyrrole.bonds.some((x) => x.type === 2 && x.atoms.includes(0))], [2, false], "pyrrole: the NH takes no double bond");
  assert.equal(doubles(fromCdxml(ring(6, {}, false)).mol), 3, "a ring of 1.5 bonds with no circle is still made Kekulé");
  // Octet writes its circled rings and dashed doubles in ChemDraw's form, and reads its own back exactly.
  const m = { ...benzene, bonds: [...benzene.bonds], atoms: [...benzene.atoms, A("C", 3, 0), A("C", 4, 0.5)] };
  m.bonds.push(b(6, 7, { type: 2, display: "dashed" }));
  const text = toCdxml(m, DEFAULT_STYLE);
  assert.equal((text.match(/Order="1.5"/g) ?? []).length, 7, "six ring bonds and the dashed double");
  assert.match(text, /Order="1.5"\s+Display2="Dash"/);
  const oval = /<graphic[^>]*GraphicType="Oval"[^>]*OvalType="Circle"[^>]*\/>/.exec(text)?.[0] ?? "";
  const c = oval.match(/Center3D="([\d.]+) ([\d.]+)/)!, e = oval.match(/MajorAxisEnd3D="([\d.]+) ([\d.]+)/)!;
  // ChemDraw's radius for a six-membered ring at 18% bond spacing: 14.4 × (√3/2 − 0.18 × 4/3) = 9.02 pt.
  assert.ok(Math.abs(Number(e[1]) - Number(c[1]) - 14.4 * (Math.sqrt(3) / 2 - 0.18 * 4 / 3)) < 0.02, `circle radius: ${oval}`);
  const again = fromCdxml(text).mol;
  assert.deepEqual(again.bonds.map((x) => [x.type, x.display]), m.bonds.map((x) => [x.type, x.display]), "Kekulé bonds and the dashed double come back");
  assert.deepEqual([again.atoms.slice(0, 6).every((a) => a.circle), again.shapes], [true, undefined]);
  // ChemDraw's copy (Octet's own data dropped): the same drawing, the ring made Kekulé again.
  const plain = fromCdxml(text.replace(/ Octet="[^"]*"/g, "").replace(/CreationProgram="[^"]*"/, "")).mol;
  assert.deepEqual([doubles(plain), plain.atoms.slice(0, 6).every((a) => a.circle), plain.shapes, plain.bonds[6].display], [4, true, undefined, "dashed"]);
  // The Aromatic double (both lines dashed): order 1.5 with Display and Display2 dashed, both ways; and ChemDraw reads
  // order 2 with a dashed Display as Aromatic too.
  const ar = { atoms: [A("C", 0, 0), A("C", 1, 0)], bonds: [b(0, 1, { type: 2, display: "aromatic" })] } as Mol;
  const arText = toCdxml(ar, DEFAULT_STYLE);
  assert.match(arText, /Order="1.5"\s+Display="Dash"\s+Display2="Dash"/);
  assert.deepEqual([fromCdxml(arText).mol.bonds[0].type, fromCdxml(arText).mol.bonds[0].display], [2, "aromatic"]);
  assert.equal(fromCdxml(arText.replace('Order="1.5"', 'Order="2"').replace(/\s+Display2="Dash"/, "")).mol.bonds[0].display, "aromatic");
  console.log("cdxml.check: delocalised rings, dashed and aromatic doubles ok");
}
