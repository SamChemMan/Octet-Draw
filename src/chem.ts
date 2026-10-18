// The chemistry engine (Indigo) and the drawing style, shared by the editor and the dev gallery.
import Indigo from "indigo-ketcher/binaryWasmNoRender";
import { hydrogens, NONMETAL, ORDER, type Face, type Ink, type Mol } from "./render.ts";
import { fontStack } from "./docstyle.ts";
import { labelSmiles } from "./labels.ts";
import { fragments, insertMol, labelPlacer, levelTurn, pickAtoms, renumberCentre, subset } from "./edit.ts";
import { graphOf, type Graph } from "./naming.ts";
import { clean2d } from "./clean2d.ts";
import { counts } from "./mass.ts";
import { hasQuery, polymerBrackets, polymerLabel, repeatCount } from "./query.ts";
import { isQueryMolfile, readV3000, RXCTR, writeV3000 } from "./molv3.ts";
import { axialLabels } from "./axial.ts";
import type { StereoFacts } from "./check.ts";

type IndigoModule = Awaited<ReturnType<typeof Indigo>>;
let indigo: IndigoModule | undefined;
export const ready: Promise<void> = Indigo().then((m: IndigoModule) => { indigo = m; });

// Drawing sizes come from brand/tokens.css (ACS 1996).
const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name);
const pt = (name: string) => (parseFloat(token(name)) * 4) / 3; // pt to px
const BOND = pt("--bond-length");
export const STYLE = {
  bond: BOND,
  line: pt("--bond-width"),
  bold: pt("--bond-bold"),
  spacing: (parseFloat(token("--bond-spacing")) / 100) * BOND,
  hash: pt("--hash-spacing"),
  // ChemDraw's bonds clear the glyph outlines by 1.69 pt for a 1.6 pt margin (measured).
  margin: (pt("--margin-width") * 1.69) / 1.6,
  size: pt("--atom-label-size"),
};

// Glyph metrics and outlines. The outline is the edge pixels of the text drawn 8x larger, scaled back.
const FONT = token("--atom-label-font");
const SCALE = 8;
const inks = new Map<string, Ink>();
// Label metrics for a font and size (px), plain or bold or italic. Each text is measured once per font, size and face.
export const measurer = (font: string, size: number, bold = false, italic = false) => (text: string): Ink => {
  const key = `${font}|${size}|${bold}|${italic}|${text}`, cached = inks.get(key), face = `${italic ? "italic " : ""}${bold ? "bold " : ""}`;
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  const g = canvas.getContext("2d", { willReadFrequently: true })!;
  g.font = `${face}${size}px ${font}`;
  const m = g.measureText(text);
  const pad = 2, baseline = size * 1.2;
  const w = (canvas.width = Math.ceil((m.width + 2 * pad) * SCALE)), h = (canvas.height = Math.ceil(size * 1.6 * SCALE));
  g.font = `${face}${size * SCALE}px ${font}`;
  g.fillText(text, pad * SCALE, baseline * SCALE);
  const alpha = g.getImageData(0, 0, w, h).data;
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && alpha[(y * w + x) * 4 + 3] > 127;
  const outline: [number, number][] = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (on(x, y) && !(on(x - 1, y) && on(x + 1, y) && on(x, y - 1) && on(x, y + 1)))
        outline.push([(x + 0.5) / SCALE - pad, (y + 0.5) / SCALE - baseline]);
  const ink = { width: m.width, ascent: m.actualBoundingBoxAscent, outline };
  inks.set(key, ink);
  return ink;
};
const plain = measurer(FONT, STYLE.size);
// A label's metrics in its own face (an atom's label can have its own font, bold and italic).
export const measure = (text: string, face?: Face): Ink =>
  face ? measurer(face.font ? fontStack(face.font) : FONT, STYLE.size, !!face.bold, !!face.italic)(text) : plain(text);

// A caption line's advance width in px, in the caption font. A width grows with the size (to within 0.04 px up to
// 40 px), so each text is measured once, at 100 px, for every size: a scale drag measures nothing again.
const CAPTION_FONT = token("--caption-font");
const widths = new Map<string, number>();
const meter = document.createElement("canvas").getContext("2d")!;
export function textWidth(text: string, size: number, bold?: boolean, italic?: boolean, family = CAPTION_FONT): number {
  const face = `${italic ? "italic " : ""}${bold ? "bold " : ""}`, key = `${face}${family}|${text}`;
  let w = widths.get(key);
  if (w === undefined) { meter.font = `${face}100px ${family}`; w = meter.measureText(text).width / 100; widths.set(key, w); }
  return w * size;
}
// How far a piece of caption text reaches above and below its baseline in px: its tallest character and its lowest
// descender, as drawn (Variable line spacing).
const extents = new Map<string, [number, number]>();
export function textExtent(text: string, size: number, bold?: boolean, italic?: boolean, family = CAPTION_FONT): [number, number] {
  const font = `${italic ? "italic " : ""}${bold ? "bold " : ""}${size}px ${family}`, key = `${font}|${text}`;
  let e = extents.get(key);
  if (e === undefined) { meter.font = font; const m = meter.measureText(text); e = [m.actualBoundingBoxAscent, m.actualBoundingBoxDescent]; extents.set(key, e); }
  return e;
}
export { CAPTION_FONT };

function engine() {
  if (!indigo) throw new Error("Indigo is not loaded yet");
  return indigo;
}

// A KET atom as Octet's: KET radicals 2 and 3 are one and two unpaired electrons. A map number and an enhanced
// stereo flag (abs, &n, orn) are kept.
type KetAtom = { label: string; location: [number, number, number]; charge?: number; radical?: number; isotope?: number; mapping?: number; stereoLabel?: string };
const atomOfKet = (a: KetAtom): Mol["atoms"][number] =>
  ({ label: a.label, location: a.location, charge: a.charge, ...(a.radical ? { radical: a.radical === 1 ? 3 : a.radical - 1 } : {}), ...(a.isotope ? { isotope: a.isotope } : {}),
    ...(Number.isInteger(a.mapping) && a.mapping! > 0 && a.mapping! <= 9999 ? { map: a.mapping } : {}),
    ...(/^(abs|&[1-9]\d?|or[1-9]\d?)$/.test(a.stereoLabel ?? "") ? { enhanced: a.stereoLabel } : {}) });

// Pasted, typed and imported text can stop the editor, as Indigo runs on the main thread: it reads very long text
// slowly, and its layout can tidy a crowded structure (a ring atom with five phenyls, a dense dendrimer) for minutes.
// So Octet reads at most 20,000 characters of SMILES and 300,000 of a file (a 1,000-atom KET file is 250,000), lays
// out at most 1,000 atoms, and caps the layout's rounds of tidying. 50 rounds is the fewest that lays out every real
// structure tried as no cap does (Pd(PPh3)4 needs 50). Each round costs more on a bigger structure, so the cap falls
// to 10 rounds at 400 atoms (a 100-residue peptide needs 10). The slowest structure tried takes half a second, and a
// 300,000-character file that is not chemistry takes under a second to refuse (src/layout.check.ts).
const MOST_CHARACTERS = 300_000, MOST_SMILES = 20_000, MOST_ATOMS = 1000;
// The reason to show for text over a limit.
const over = (most: number, what: string) => new RangeError(`It has more than ${most.toLocaleString("en-GB")} ${what}.`);
// Atoms in a SMILES (bracket atoms and the organic subset), up to the first space (CXSMILES and names come after it).
const smilesAtoms = (smiles: string) => smiles.split(/\s/)[0].match(/\[[^\]]*\]|Br|Cl|[BCNOPSFIbcnops*]/g)?.length ?? 0;

// A structure file (MOL, SDF, RXN, RDF, CDXML, KET, SMILES), keeping the file's own drawing where it has one.
// Coordinates are scaled so the median bond is one bond length; SMILES (no drawing) is laid out. A reaction keeps its
// arrows and plus signs; an RD file's reactions stand one under another.
// Throws a RangeError, with the reason to show, for text over Octet's limits.
export function importStructure(text: string): Mol {
  if (text.length > MOST_CHARACTERS) throw over(MOST_CHARACTERS, "characters");
  const ind = engine(), opts = new ind.MapStringString();
  try {
    opts.set("output-content-type", "application/json");
    opts.set("dearomatize-on-load", "true");
    const hasDrawing = /V2000|V3000|<CDXML|"root"|<cml[\s>]/i.test(text);
    if (!hasDrawing) return parseStructure(text);
    if (/^\s*\$RDFILE/.test(text)) return readRdf(text);
    // A query or Markush molfile: read by Octet, so its query data is kept (molv3.ts). A V2000 one (R-groups, atom
    // lists, substitution counts, S-groups) is made V3000 by Indigo first.
    const reaction = /^\s*\$RXN/.test(text);
    const v2000 = !reaction && /V2000/.test(text) && /^M {2}(RGP|ALS|SUB|UNS|RBC|LIN|STY|LOG)|^\$RGP|^(?:.{31})(R#|L |A |Q )|^.{6}  [5-8] /m.test(text);
    const v3000 = v2000 ? (() => { try { return convert(text, "molfile", { "molfile-saving-mode": "3000" }); } catch { return ""; } })() : text;
    if (!reaction && isQueryMolfile(v3000)) {
      const mol = readV3000(v3000);
      const lengths = mol.bonds.map((b) => Math.hypot(mol.atoms[b.atoms[1]].location[0] - mol.atoms[b.atoms[0]].location[0], mol.atoms[b.atoms[1]].location[1] - mol.atoms[b.atoms[0]].location[1])).sort((a, b) => a - b);
      const k = 1 / (lengths[Math.floor(lengths.length / 2)] || 1), at = (q: [number, number]): [number, number] => [q[0] * k, q[1] * k];
      return { ...mol, atoms: mol.atoms.map((a) => ({ ...a, location: [a.location[0] * k, a.location[1] * k, (a.location[2] ?? 0) * k] })), ...(mol.shapes ? { shapes: mol.shapes.map((sh) => ({ ...sh, from: at(sh.from), to: at(sh.to) })) } : {}) };
    }
    return scaled(fromKet(JSON.parse(JSON.parse(ind.convert(text, "ket", opts)).struct), /^\$\$\$\$/m.test(text)));
  } finally {
    opts.delete();
  }
}
// A drawing with its median bond one bond length long.
function scaled(mol: Mol): Mol {
  const lengths = mol.bonds.map((b) => Math.hypot(mol.atoms[b.atoms[1]].location[0] - mol.atoms[b.atoms[0]].location[0], mol.atoms[b.atoms[1]].location[1] - mol.atoms[b.atoms[0]].location[1])).sort((a, b) => a - b);
  const k = 1 / (lengths[Math.floor(lengths.length / 2)] || 1), at = (q: [number, number]): [number, number] => [q[0] * k, q[1] * k];
  return {
    ...mol, atoms: mol.atoms.map((a) => ({ ...a, location: [a.location[0] * k, a.location[1] * k, (a.location[2] ?? 0) * k] })),
    ...(mol.arrows ? { arrows: mol.arrows.map((a) => ({ ...a, from: at(a.from), to: at(a.to) })) } : {}),
    // A plus sign's point is its middle; its caption's point is its baseline, a quarter of a bond length lower.
    ...(mol.captions ? { captions: mol.captions.map((c) => ({ ...c, x: c.x * k, y: c.y * k - 0.25 })) } : {}),
  };
}
// Indigo's KET as a drawing: its molecules, with their map numbers and enhanced stereo, and a reaction's arrows and
// plus signs (Octet's reaction arrows and "+" captions). apart: the molecules are an SD file's records, which other
// programs often draw at one place; when two overlap, they are set in a row.
function fromKet(ket: Record<string, unknown> & { root: { nodes: Record<string, unknown>[] } }, apart = false): Mol {
  const mol: Mol = { atoms: [], bonds: [] }, arrows: NonNullable<Mol["arrows"]> = [], captions: NonNullable<Mol["captions"]> = [];
  let id = 1;
  for (const node of ket.root.nodes) {
    const frag = typeof node.$ref === "string" ? ket[node.$ref] as { type?: string; atoms: KetAtom[]; bonds: Mol["bonds"] } : undefined;
    if (frag?.type === "molecule") {
      const base = mol.atoms.length;
      mol.atoms.push(...frag.atoms.map(atomOfKet));
      // A bond's reacting centre (KET "center", the MDL code) is its Rxn mark.
      const rxnOf = (b: { center?: number }) => Object.keys(RXCTR).find((k) => RXCTR[k] === b.center) as Mol["bonds"][number]["rxn"];
      mol.bonds.push(...frag.bonds.map((b) => { const rxn = rxnOf(b as { center?: number }); return { type: b.type, atoms: [b.atoms[0] + base, b.atoms[1] + base] as [number, number], stereo: b.stereo, ...(rxn ? { rxn } : {}) }; }));
    } else if (node.type === "plus" && Array.isArray(node.location)) {
      const [x, y] = (node.location as number[]).map(Number);
      if (Number.isFinite(x) && Number.isFinite(y)) captions.push({ id: id++, text: "+", x, y, align: "centre" });
    } else if (node.type === "arrow") {
      const d = node.data as { mode?: string; pos?: { x: number; y: number }[] } | undefined, [p, q] = d?.pos ?? [];
      if (!p || !q || ![p.x, p.y, q.x, q.y].every(Number.isFinite)) continue;
      const mode = String(d?.mode ?? "");
      const kind = /equilibrium/.test(mode) ? "equilibrium" : /retrosynthetic/.test(mode) ? "retro" : /failed/.test(mode) ? "nogo" : /both-ends/.test(mode) ? "resonance" : "reaction";
      arrows.push({ id: id++, kind, from: [p.x, p.y], to: [q.x, q.y], ...(/dashed/.test(mode) ? { style: "dashed" as const } : {}) });
    }
  }
  if (apart) {
    const groups = fragments(mol), box = (g: number[]) => [0, 1].flatMap((k) => [Math.min(...g.map((i) => mol.atoms[i].location[k])), Math.max(...g.map((i) => mol.atoms[i].location[k]))]);
    const boxes = groups.map(box), touch = (p: number[], q: number[]) => p[0] <= q[1] && q[0] <= p[1] && p[2] <= q[3] && q[2] <= p[3];
    if (boxes.some((p, k) => boxes.slice(k + 1).some((q) => touch(p, q)))) {
      const lengths = mol.bonds.map((b) => Math.hypot(...[0, 1].map((k) => mol.atoms[b.atoms[1]].location[k] - mol.atoms[b.atoms[0]].location[k]))).sort((x, y) => x - y);
      const gap = 2 * (lengths[Math.floor(lengths.length / 2)] || 1);
      let x = 0;
      groups.forEach((g, k) => {
        const [x0, x1, y0, y1] = boxes[k], dx = x - x0, dy = -(y0 + y1) / 2;
        for (const i of g) mol.atoms[i] = { ...mol.atoms[i], location: [mol.atoms[i].location[0] + dx, mol.atoms[i].location[1] + dy, mol.atoms[i].location[2]] };
        x += x1 - x0 + gap;
      });
    }
  }
  return { ...mol, ...(arrows.length ? { arrows } : {}), ...(captions.length ? { captions } : {}) };
}
// An RD file: each reaction (and molecule) record read on its own, one under another, so no two overlap.
function readRdf(text: string): Mol {
  const records = text.replace(/\r\n?/g, "\n").split(/^\$[RM]FMT[^\n]*\n/m).slice(1).slice(0, 200)
    .map((r) => r.replace(/^\$(RIREG|REREG|MIREG|MEREG)[^\n]*\n/, "").split(/^\$DTYPE/m)[0].trimEnd()).filter((r) => r.trim());
  if (!records.length) throw new Error("This RD file has no reactions.");
  let out: Mol = { atoms: [], bonds: [] }, top = 0;
  for (const r of records) {
    const part = importStructure(r.startsWith("$RXN") ? r : `${r}\n`), ys = [...part.atoms.map((a) => a.location[1]), ...(part.arrows ?? []).flatMap((a) => [a.from[1], a.to[1]])];
    if (!ys.length) continue;
    const dy = top - Math.max(...ys);
    out = insertMol(out, part, [0, dy]).mol;
    top += Math.min(...ys) - Math.max(...ys) - 3;
  }
  return out;
}

// SMILES (or a MOL file) to a laid-out molecule with Kekulé bonds and stereo wedges. All fragments are kept.
// Throws a RangeError, with the reason to show, for text over Octet's limits.
export function parseStructure(text: string): Mol {
  // SMILES is one line, counted as written (Indigo reads a long SMILES slowly); a MOL file or other file, through Indigo.
  const file = /^[{<]|[\r\n]/.test(text.trim()), most = file ? MOST_CHARACTERS : MOST_SMILES;
  if (text.length > most) throw over(most, "characters");
  // An RD file (pasted as text) is read record by record, as Import reads it: Indigo reads only one of its reactions.
  if (/^\s*\$RDFILE/.test(text)) return readRdf(text);
  const atoms = smilesAtoms(file ? convert(text, "smiles") : text);
  if (atoms > MOST_ATOMS) throw over(MOST_ATOMS, "atoms");
  const ind = engine(), opts = new ind.MapStringString();
  try {
    opts.set("output-content-type", "application/json");
    opts.set("dearomatize-on-load", "true");
    opts.set("layout-max-iterations", String(Math.min(50, Math.max(10, Math.round(4000 / atoms)))));
    // A reaction (reactants>agents>products) keeps its arrow and plus signs.
    const out = fromKet(JSON.parse(JSON.parse(ind.layout(text, "ket", opts)).struct));
    return out.captions ? { ...out, captions: out.captions.map((c) => ({ ...c, y: c.y - 0.25 })) } : out;
  } finally {
    opts.delete();
  }
}

// Each label's group as Indigo reads it, kept by the label's text, so each label is read once. Not kept while Indigo
// is loading. Cleared when it grows large.
const labelGroups = new Map<string, Mol | undefined>();
function labelGroup(text: string): Mol | undefined {
  if (labelGroups.has(text)) return labelGroups.get(text);
  let frag: Mol | undefined;
  try { const smiles = labelSmiles(text); frag = smiles ? parseStructure(smiles) : undefined; } catch { frag = undefined; }
  if (!indigo) return frag;
  if (labelGroups.size >= 1000) labelGroups.clear();
  labelGroups.set(text, frag);
  return frag;
}
// Written labels (OMe, CO2Et, Ph) as real atoms, for chemistry. Each label's group is read by Indigo and joined
// where the label atom was. A label Octet cannot read (or Indigo cannot) stays as a pseudo-atom ("*"), so no label
// text can stop the drawing's chemistry.
export const expandLabels = (mol: Mol): Mol => expandWithOrigins(mol).mol;
// The same, with the drawn atom each expanded atom came from (a label's atoms all come from the label).
export function expandWithOrigins(mol: Mol): { mol: Mol; from: number[] } {
  let out: Mol = { atoms: mol.atoms.map((a) => ({ ...a })), bonds: mol.bonds.map((b) => ({ ...b })) };
  const origin = mol.atoms.map((_, i) => i);
  // A multi-centre attachment (an η bond) is left out of the chemistry, with its bonds. A variable attachment's
  // substituent is joined to the first of its atoms: every positional isomer has the same formula.
  mol.atoms.forEach((a, i) => {
    if (!a.centre) return;
    const to = a.centre.variable ? a.centre.atoms.find((j) => mol.atoms[j] && !mol.atoms[j].centre) : undefined;
    out.bonds = out.bonds.flatMap((b) => (!b.atoms.includes(i) ? [b] : to === undefined ? [] : [{ ...b, atoms: b.atoms.map((k) => (k === i ? to : k)) as [number, number] }]));
    out.atoms[i] = { ...out.atoms[i], label: "*", text: undefined, centre: undefined, removed: true } as Mol["atoms"][number];
  });
  mol.atoms.forEach((a, i) => {
    // A multi-centre point (an η ligand's) is not an atom: it and its bond are left out.
    if (a.centre) { out.atoms[i] = { ...out.atoms[i], removed: true } as Mol["atoms"][number]; return; }
    if (!a.text) return;
    const frag = labelGroup(a.text);
    if (!frag?.atoms.length) { out.atoms[i] = { ...out.atoms[i], label: "*", text: undefined }; return; }
    const base = out.atoms.length, place = labelPlacer(mol, i, frag);
    origin.push(...frag.atoms.map(() => i));
    // The group's first atom takes the label atom's place: bonds to the label atom move to it, and the group points
    // away from the rest as Expand Label draws it, so a wedge beside a label reads right. The kept group's atoms are
    // copied, so no change to the result can change it.
    out = {
      atoms: [...out.atoms, ...frag.atoms.map((x) => ({ ...x, location: place(x.location) }))],
      bonds: [
        ...out.bonds.map((b) => ({ ...b, atoms: b.atoms.map((k) => (k === i ? base : k)) as [number, number] })),
        ...frag.bonds.map((b) => ({ ...b, atoms: [b.atoms[0] + base, b.atoms[1] + base] as [number, number] })),
      ],
    };
    out.atoms[base] = { ...out.atoms[base], charge: (out.atoms[base].charge ?? 0) + (a.charge ?? 0) || undefined };
    out.atoms[i] = { ...out.atoms[i], label: "*", text: undefined, removed: true } as Mol["atoms"][number];
  });
  // Drop the label atoms that were replaced, renumbering bonds.
  const keep = out.atoms.map((a) => !(a as { removed?: boolean }).removed), map: number[] = [];
  let next = 0;
  out.atoms.forEach((_, k) => { if (keep[k]) map[k] = next++; });
  return {
    mol: { atoms: out.atoms.filter((_, k) => keep[k]), bonds: out.bonds.filter((b) => keep[b.atoms[0]] && keep[b.atoms[1]]).map((b) => ({ ...b, atoms: [map[b.atoms[0]], map[b.atoms[1]]] as [number, number] })) },
    from: origin.filter((_, k) => keep[k]),
  };
}

// The drawing as SMILES. Throws if Indigo can't read it (for example, a valence it rejects).
// A drawing as KET, with labels expanded into atoms. KET has no bond display styles (bold, wavy and so on). Without
// wedges (wedges = false), Indigo also reads a drawing whose wedges it rejects: formulas and masses do not need them.
// keep: each atom's map number and enhanced stereo flag, and each bond's Rxn mark, go too, for MDL and reaction files.
function ketOf(drawn: Mol, wedges = true, mol = expandLabels(drawn), keep = false): string {
  return JSON.stringify({ root: { nodes: [{ $ref: "mol0" }] }, mol0: ketMol(mol, wedges, keep) });
}
function ketMol(mol: Mol, wedges: boolean, keep: boolean) {
  const bonds = mol.bonds.map(({ type, atoms, stereo, rxn }) => ({ type, atoms, ...(stereo && wedges ? { stereo } : {}), ...(keep && rxn && RXCTR[rxn] !== undefined ? { center: RXCTR[rxn] } : {}) }));
  // An atom bonded to a metal keeps the hydrogens Octet draws on it (as render.ts counts them): Indigo would count the P
  // of a PPh3 bonded to Pd as PH (valence 5), where the drawing shows P. It goes to Indigo as the atom's valence: as a
  // hydrogen count, a drawing with an R group (a query) would write it into a molfile as a query feature.
  const used = mol.atoms.map(() => 0), metalled = mol.atoms.map(() => false);
  for (const b of mol.bonds) for (const [i, j] of [b.atoms, [b.atoms[1], b.atoms[0]]]) { used[i] += ORDER[b.type] ?? 1; if (!NONMETAL.has(mol.atoms[j].label)) metalled[i] = true; }
  const valence = (i: number, a: Mol["atoms"][number]) => Math.round(used[i]) + (a.implicitHCount ?? hydrogens(a.label, a.charge ?? 0, used[i], a.radical === 3 ? 2 : a.radical));
  // KET radicals: 1 a singlet, 2 one unpaired electron (doublet), 3 two (triplet). KET's stereo labels are Octet's
  // flags ("abs", "&1", "or1").
  const atoms = mol.atoms.map((a, i) => ({ label: a.label, location: a.location, ...(a.charge ? { charge: a.charge } : {}), ...(a.radical ? { radical: a.radical === 3 ? 1 : a.radical + 1 } : {}), ...(a.isotope ? { isotope: a.isotope } : {}),
    ...(metalled[i] && NONMETAL.has(a.label) ? { explicitValence: valence(i, a) } : {}),
    ...(keep && a.map ? { mapping: a.map } : {}), ...(keep && /^(abs|&\d+|or\d+)$/.test(a.enhanced ?? "") ? { stereoLabel: a.enhanced } : {}) }));
  return { type: "molecule", atoms, bonds };
}
function convert(input: string, format: string, options: Record<string, string> = {}): string {
  const ind = engine(), opts = new ind.MapStringString();
  try {
    for (const [k, v] of Object.entries(options)) opts.set(k, v);
    // Only the end: a molfile's first line (its name) is blank, and without it the file does not read.
    return ind.convert(input, format, opts).trimEnd();
  } finally {
    opts.delete();
  }
}
export const toSmiles = (drawn: Mol): string => convert(ketOf(drawn), "smiles");
// The drawing's molecules as a molfile: V3000, as ChemDraw 26.1 saves it, or V2000 (as ChemDraw puts it on the
// clipboard). Map numbers and enhanced stereo go too; V2000 has no enhanced stereo. A query or Markush structure is
// written as V3000 by Octet itself (molv3.ts), with its written labels drawn out as Indigo reads them; its V2000 is
// Indigo's, read from that.
export function toMolfile(drawn: Mol, v2000 = false): string {
  const mode = { "molfile-saving-mode": v2000 ? "2000" : "3000" };
  if (!hasQuery(drawn)) return convert(ketOf(drawn, true, undefined, true), "molfile", mode);
  const v3 = writeV3000(drawn, labelGroup);
  return v2000 ? convert(v3, "molfile", mode) : v3;
}
// An SD file: one record for each structure, as ChemDraw saves one. A drawing with R-group definitions is one record,
// so its definitions stay with it. A lone atom (methane, a label such as MeOH) is a record too; polymer brackets go
// with each record, where they enclose its atoms.
export function toSdf(drawn: Mol, v2000 = false): string {
  const parts = drawn.shapes?.some((sh) => sh.rgroup) ? [drawn] : fragments(drawn).map((g) => ({ ...pickAtoms(drawn, g), ...(drawn.shapes ? { shapes: drawn.shapes } : {}) }));
  return parts.map((p) => `${toMolfile(p, v2000)}\n$$$$\n`).join("");
}

// One step of a reaction, for RXN, RDF and reaction SMILES: its reactants, its products, and its agents (the structures
// drawn above and below its arrow), each a structure's atoms.
export type RxnStep = { reactants: number[][]; products: number[][]; agents: number[][] };
// A step as a KET reaction for Indigo: each structure keeps its own drawing, set in a row with plus signs between, the
// arrow after the reactants with the agents over it, then the products, so Indigo reads each part as the step says.
function reactionKet(drawn: Mol, step: RxnStep): string {
  const out: Record<string, unknown> = {}, nodes: unknown[] = [];
  let x = 0, k = 0;
  // A structure at x (its left edge), its middle at y; returns its width.
  const put = (atoms: number[], at: number, y = 0) => {
    const m = ketMol(expandLabels(pickAtoms(drawn, atoms)), true, true), xs = m.atoms.map((a) => a.location[0]), ys = m.atoms.map((a) => a.location[1]);
    const dx = at - Math.min(...xs), dy = y - (Math.min(...ys) + Math.max(...ys)) / 2;
    m.atoms = m.atoms.map((a) => ({ ...a, location: [a.location[0] + dx, a.location[1] + dy, 0] as [number, number, number] }));
    out[`mol${k}`] = m;
    nodes.push({ $ref: `mol${k++}` });
    return Math.max(...xs) - Math.min(...xs);
  };
  const row = (list: number[][]) => list.forEach((atoms, j) => { if (j) { nodes.push({ type: "plus", location: [x + 0.75, 0, 0] }); x += 1.5; } x += put(atoms, x) + 1.5; });
  row(step.reactants);
  const widths = step.agents.map((atoms) => { const xs = atoms.map((i) => drawn.atoms[i].location[0]); return Math.max(...xs) - Math.min(...xs); });
  const span = Math.max(3, widths.reduce((s, w) => s + w + 1, 1));
  let ax = x + (span - widths.reduce((s, w) => s + w + 1, -1)) / 2;
  step.agents.forEach((atoms, j) => { put(atoms, ax, 1.5); ax += widths[j] + 1; });
  nodes.push({ type: "arrow", data: { mode: "open-angle", pos: [{ x, y: 0, z: 0 }, { x: x + span, y: 0, z: 0 }] } });
  x += span + 1.5;
  row(step.products);
  return JSON.stringify({ root: { nodes }, ...out });
}
// Reactions as an RXN file (the first step), an RD file (every step, one record each) or reaction SMILES (one line
// for each step), with their map numbers. RXN and RD files are V3000, as ChemDraw 26.1 saves them, or V2000.
export function toReaction(drawn: Mol, steps: RxnStep[], kind: "rxn" | "rdf" | "smiles", v2000 = false): string {
  const mode = { "molfile-saving-mode": v2000 ? "2000" : "3000" };
  if (kind === "smiles") return steps.map((s) => convert(reactionKet(drawn, s), "smiles")).join("\n");
  if (kind === "rxn") return convert(reactionKet(drawn, steps[0]), "rxnfile", mode);
  const d = new Date(), two = (n: number) => String(n).padStart(2, "0");
  const date = `${two(d.getMonth() + 1)}/${two(d.getDate())}/${two(d.getFullYear() % 100)} ${two(d.getHours())}:${two(d.getMinutes())}`;
  return [`$RDFILE 1`, `$DATM    ${date}`, ...steps.flatMap((s) => ["$RFMT", convert(reactionKet(drawn, s), "rxnfile", mode)])].join("\n") + "\n";
}
// Generic labels as query atoms (any atom A, heteroatom Q, metal M, halogen X, and each with H, as ChemDraw's).
// SMILES cannot keep them; a molfile can, for a Reaxys search. undefined when the drawing has none.
// As ChemDraw 26.1 writes a molfile (CoreChemistry IsAcceptableGeneric): A, Q and X go as the atom symbol; the
// others go as a carbon with the label as its alias ("A  n" and the label on the next line).
const GENERIC = new Set(["A", "AH", "Q", "QH", "M", "MH", "X", "XH"]), SYMBOL = new Set(["A", "Q", "X"]);
export function toQueryMolfile(drawn: Mol): string | undefined {
  if (!drawn.atoms.some((a) => a.text && GENERIC.has(a.text))) return undefined;
  const generic = (a: Mol["atoms"][number]) => !!a.text && GENERIC.has(a.text);
  const query = { ...drawn, atoms: drawn.atoms.map((a) => (generic(a) ? { ...a, label: SYMBOL.has(a.text!) ? a.text! : "C", text: undefined } : a)) };
  const { mol, from } = expandWithOrigins(query);
  const aliases = drawn.atoms.flatMap((a, i) => (generic(a) && !SYMBOL.has(a.text!) ? [`A  ${String(from.indexOf(i) + 1).padStart(3)}`, a.text!] : []));
  // From the counts line on, under the header Reaxys was seen to read: a name, the program, a blank line.
  // (A V3000 molfile, for 1000 atoms or more, goes whole: no search link can hold it, and the app says so.)
  const lines = convert(ketOf(query, true, mol), "molfile").split("\n"), at = lines.findIndex((l) => l.endsWith("V2000")), end = lines.lastIndexOf("M  END");
  return ["Octet", "  Octet", "", ...lines.slice(Math.max(0, at), end), ...aliases, ...lines.slice(end), ""].join("\n");
}
// CIP labels for a drawing's stereocentres (R, S) and double bonds (E, Z), in its atom and bond order.
export function cipOf(drawn: Mol): { atoms: (string | undefined)[]; bonds: (string | undefined)[] } | undefined {
  const ind = engine(), opts = new ind.MapStringString();
  try {
    opts.set("output-content-type", "application/json");
    const ket = JSON.parse(JSON.parse(ind.calculateCip(ketOf(drawn), "ket", opts)).struct).mol0;
    if (!ket || ket.atoms.length !== drawn.atoms.length) return undefined;
    return { atoms: ket.atoms.map((a: { cip?: string }) => a.cip), bonds: ket.bonds.map((b: { cip?: string }) => b.cip) };
  } catch {
    return undefined;
  } finally {
    opts.delete();
  }
}
// The structures (connected atoms) of a drawing, each with its atoms in order, its bonds, and a key for what
// Indigo sees of it for stereo: its atoms (element, label, charge, radical, isotope, and place relative to its first
// atom) and bonds (with their stereo). Two structures with one key give the same labels, so labels kept by key are
// worked out again only for the structures an edit changes, wherever they are on the page.
function keyed(mol: Mol): { ids: number[]; bonds: number[]; key: string; part: () => Mol }[] {
  const groups = fragments(mol).map((g) => g.sort((a, b) => a - b)), of: number[] = [];
  groups.forEach((g, k) => g.forEach((i) => { of[i] = k; }));
  const bonds: number[][] = groups.map(() => []);
  mol.bonds.forEach((b, k) => bonds[of[b.atoms[0]]]?.push(k));
  return groups.map((ids, k) => {
    const local = new Map(ids.map((i, n) => [i, n])), o = mol.atoms[ids[0]].location;
    const atoms = ids.map((i) => {
      const a = mol.atoms[i];
      return [a.label, a.text ?? "", a.charge ?? 0, a.radical ?? 0, a.isotope ?? 0, ...[0, 1, 2].map((d) => Math.round(((a.location[d] ?? 0) - (o[d] ?? 0)) * 1e4))].join(" ");
    });
    const bs = bonds[k].map((n) => { const b = mol.bonds[n]; return [b.type, b.stereo ?? 0, local.get(b.atoms[0]), local.get(b.atoms[1])].join(" "); });
    const part = (): Mol => ({ atoms: ids.map((i) => renumberCentre(mol.atoms[i], local)), bonds: bonds[k].map((n) => ({ ...mol.bonds[n], atoms: mol.bonds[n].atoms.map((i) => local.get(i)!) as [number, number] })) });
    return { ids, bonds: bonds[k], key: `${atoms.join(",")};${bs.join(",")}`, part };
  });
}
// Show Stereochemistry's labels, in the drawing's own atom and bond order: R, S (and r, s) on stereocentres, E, Z on
// double bonds, and M, P on the middle atom of an allene and on a biaryl's axis bond. Each structure is labelled on its own (Indigo splits a drawing into molecules), and only once
// while it does not change. Written labels (OMe, CO2Et) are expanded first; stereocentres inside a label have no
// drawn atom and are left out.
type Labels = { atoms: (string | undefined)[]; bonds: (string | undefined)[] };
const labelled = new Map<string, Labels | null>();
export function stereoLabels(drawn: Mol): Labels | undefined {
  const atoms: (string | undefined)[] = drawn.atoms.map(() => undefined), bonds: (string | undefined)[] = drawn.bonds.map(() => undefined);
  for (const { ids, bonds: own, key, part } of keyed(drawn)) {
    // A structure with no wedge, hash or double bond has no R, S, E or Z.
    if (ids.length < 3 || !own.some((k) => drawn.bonds[k].stereo || drawn.bonds[k].type === 2)) continue;
    const found = remembered(labelled, key, () => labelsOf(part()));
    found?.atoms.forEach((c, n) => { atoms[ids[n]] = c; });
    found?.bonds.forEach((c, n) => { bonds[own[n]] = c; });
  }
  return atoms.some(Boolean) || bonds.some(Boolean) ? { atoms, bonds } : undefined;
}
// One structure's labels, in its own atom and bond order.
function labelsOf(part: Mol): Labels | null {
  const ind = engine(), opts = new ind.MapStringString(), clean = (c?: string) => c?.replace(/[()]/g, "") || undefined;
  try {
    opts.set("output-content-type", "application/json");
    const { mol: expanded, from } = expandWithOrigins(part);
    const atoms: (string | undefined)[] = part.atoms.map(() => undefined), bonds: (string | undefined)[] = part.bonds.map(() => undefined);
    // Octet's own (M) and (P) for allene and biaryl axes, which Indigo does not label.
    const axial = axialLabels(expanded);
    axial.atoms.forEach((c, k) => { if (c && !part.atoms[from[k]].text) atoms[from[k]] = c; });
    part.bonds.forEach((_, j) => { if (axial.bonds[j]) bonds[j] = axial.bonds[j]; });
    let ket;
    try { ket = JSON.parse(JSON.parse(ind.calculateCip(ketOf(part), "ket", opts)).struct).mol0; } catch { ket = undefined; }
    if (ket && ket.atoms.length === from.length) {
      ket.atoms.forEach((a: { cip?: string }, k: number) => { if (clean(a.cip) && !part.atoms[from[k]].text) atoms[from[k]] = clean(a.cip); });
      part.bonds.forEach((_, j) => { bonds[j] = clean(ket.bonds[j]?.cip) ?? bonds[j]; });
    }
    return atoms.some(Boolean) || bonds.some(Boolean) ? { atoms, bonds } : null;
  } catch {
    return null;
  } finally {
    opts.delete();
  }
}
// Standard InChI, for telling whether two structures are the same. Undefined if Indigo cannot make one.
export function toInchi(drawn: Mol | string): string | undefined {
  try {
    return convert(typeof drawn === "string" ? drawn : ketOf(drawn), "inchi") || undefined;
  } catch {
    return undefined;
  }
}

// What Indigo knows of a drawing's stereocentres, for the stereochemistry warnings (check.ts), by drawn atom: the atoms
// that can be stereocentres (read with no wedges), those whose configuration the wedges and hashes do not set, and
// those whose wedges conflict (Indigo cannot read them). A wedge that starts at an atom that cannot be a stereocentre
// is left out of the second reading, as Indigo then lists no atoms. Only structures with a wedge or hash, Show
// Stereochemistry on, or an enhanced stereo flag are read. With `chiral`, structures with an and or or flag are also
// tested for chirality: one whose mirror image (each wedge made a hash) has the same InChI is not chiral. Each
// structure's answer is kept by its atoms and bonds, so an edit reads again only the structures it changed.
type Facts = { centres: number[]; unset: number[]; conflict: number[]; achiral: boolean };
const factsKept = new Map<string, Facts>();
export function stereoFacts(drawn: Mol, chiral = false): StereoFacts {
  const out: StereoFacts = { centres: new Set(), unset: new Set(), conflict: new Set(), achiral: new Set() };
  const wedge = (b: Mol["bonds"][number]) => b.stereo === 1 || b.stereo === 6, wedged = new Set(drawn.bonds.filter(wedge).flatMap((b) => b.atoms));
  const groups = fragments(drawn), groupOf = new Int32Array(drawn.atoms.length), bondsOf: Mol["bonds"][] = groups.map(() => []);
  groups.forEach((g, k) => { for (const i of g) groupOf[i] = k; });
  for (const b of drawn.bonds) bondsOf[groupOf[b.atoms[0]]].push(b);
  groups.forEach((group, k) => {
    if (!group.some((i) => wedged.has(i) || drawn.atoms[i].cip || drawn.atoms[i].enhanced)) return;
    const flagged = chiral && group.some((i) => /^(&|or)/.test(drawn.atoms[i].enhanced ?? ""));
    // The structure on its own (atoms in drawing order), and its key: what Indigo's answer depends on.
    const ids = [...group].sort((a, b) => a - b), local = new Map(ids.map((d, j) => [d, j]));
    const part: Mol = { atoms: ids.map((i) => renumberCentre(drawn.atoms[i], local)), bonds: bondsOf[k].map((b) => ({ ...b, atoms: [local.get(b.atoms[0])!, local.get(b.atoms[1])!] as [number, number] })) };
    const key = JSON.stringify([part.atoms.map((a) => [a.label, a.text, a.charge, a.isotope, a.radical, a.location[0], a.location[1]]), part.bonds.map((b) => [b.type, b.atoms, b.stereo]), flagged]);
    let f = factsKept.get(key);
    if (!f) {
      // Read with labels expanded; kept by the structure's own atoms (an atom inside a label is left out).
      const { mol, from } = expandWithOrigins(part), read = readFacts(mol, flagged);
      const own = (list: number[]) => list.flatMap((j) => (part.atoms[from[j]] && !part.atoms[from[j]].text ? [from[j]] : []));
      f = { centres: own(read.centres), unset: own(read.unset), conflict: own(read.conflict), achiral: read.achiral };
      if (factsKept.size > 500) factsKept.clear();
      factsKept.set(key, f);
    }
    for (const [list, set] of [[f.centres, out.centres], [f.unset, out.unset], [f.conflict, out.conflict]] as const) for (const j of list) set.add(ids[j]);
    if (f.achiral) for (const i of ids) out.achiral.add(i);
  });
  return out;
}
function readFacts(mol: Mol, chiral: boolean): Facts {
  const ind = engine();
  // The atoms Indigo lists as stereocentres with no set configuration. Throws when the wedges conflict.
  const unsetOf = (m: Mol): number[] => {
    const opts = new ind.MapStringString();
    try {
      const said = JSON.parse(ind.check(ketOf(m), "stereo", opts)).stereo as string | undefined, list = said && /\(([\d,\s]+)\)/.exec(said);
      return list ? list[1].split(",").map(Number) : [];
    } finally {
      opts.delete();
    }
  };
  let centres: number[] = [];
  try { centres = unsetOf({ ...mol, bonds: mol.bonds.map((b) => ({ ...b, stereo: undefined })) }); } catch { /* no centres read */ }
  const can = new Set(centres), conflict: number[] = [];
  let kept: Mol = { ...mol, bonds: mol.bonds.map((b) => ((b.stereo === 1 || b.stereo === 6) && !can.has(b.atoms[0]) ? { ...b, stereo: undefined } : b)) }, unset: number[] = [];
  for (let k = 0; k < 8; k++) {
    try { unset = unsetOf(kept); break; } catch (err) {
      // "stereocenters: all 3 bonds up near stereoatom 0", "one bond up, one bond down -- indefinite case near atom 0"
      const at = /near (?:stereo)?atom (\d+)/.exec(String(err));
      if (!at) { unset = []; break; }
      const i = Number(at[1]);
      conflict.push(i);
      kept = { ...kept, bonds: kept.bonds.map((b) => (b.atoms[0] === i ? { ...b, stereo: undefined } : b)) };
    }
  }
  const mirror = (m: Mol): Mol => ({ ...m, bonds: m.bonds.map((b) => (b.stereo === 1 ? { ...b, stereo: 6 } : b.stereo === 6 ? { ...b, stereo: 1 } : b)) });
  const inchi = chiral ? toInchi(kept) : undefined;
  return { centres, unset: unset.filter((i) => can.has(i)), conflict, achiral: !!inchi && inchi === toInchi(mirror(kept)) };
}

// Clean Up's time. Indigo's clean-up (two passes of up to 1,000 rounds) costs about N^3 a round, from 0.27 s at 120
// atoms to 3 to 5 minutes at 1,000, and Indigo stops a pass only after 2 s. So Octet runs its own port of it
// (src/clean2d.ts): the same rounds at about N a round. Structures of up to about 40 atoms are cleaned as Indigo cleans
// them with no time limit, in under 0.1 s. Each pass of a larger structure stops after PASS ms, and several structures
// share 2 × PASS ms a pass. A large structure drawn by hand may come out rougher than Indigo's would, and Clean Up again
// tidies it further, as in ChemDraw. A structure of more than MOST_CLEAN atoms is left as drawn (src/cleanup.check.ts).
const PASS = 100;
export const MOST_CLEAN = MOST_ATOMS;

// Clean Up Structure: bond lengths and angles straightened, structure by structure. Each structure the selection
// touches (or every structure, with nothing selected) is cleaned whole, scaled to one bond length per bond at the
// structure's own scale (the median of its atoms' scales, decision 0007), and kept centred where it was. A structure
// of more than MOST_CLEAN atoms is left as drawn.
// pass: the ms each of the two passes may take for one structure.
export function cleanUp(mol: Mol, ids?: Set<number>, pass = PASS): Mol {
  const atoms = mol.atoms.map((a) => ({ ...a }));
  // Structures joined by bonds alone; one with a multi-centre or variable attachment keeps its place (the attachment
  // sits at the centre of its atoms).
  const groups = fragments(mol, false).filter((frag) => frag.length > 1 && frag.length <= MOST_CLEAN && (!ids?.size || frag.some((i) => ids.has(i))) && !frag.some((i) => mol.atoms[i].centre));
  for (const frag of groups) {
    const local = new Map(frag.map((i, k) => [i, k]));
    const bonds = mol.bonds.filter((b) => local.has(b.atoms[0]) && local.has(b.atoms[1]));
    const out = clean2d(frag.map((i) => mol.atoms[i].location), bonds.map((b) => ({ atoms: [local.get(b.atoms[0])!, local.get(b.atoms[1])!], order: b.type })), pass * Math.min(1, 2 / groups.length));
    const lengths = bonds.map((b) => {
      const [p, q] = [out[local.get(b.atoms[0])!], out[local.get(b.atoms[1])!]];
      return Math.hypot(q[0] - p[0], q[1] - p[1]);
    }).sort((a, b) => a - b);
    const own = frag.map((i) => mol.atoms[i].scale ?? 1).sort((a, b) => a - b)[Math.floor(frag.length / 2)];
    const scale = own / (lengths[Math.floor(lengths.length / 2)] || 1);
    const centre = (pts: readonly (readonly number[])[]) => [0, 1].map((k) => pts.reduce((sum, p) => sum + p[k], 0) / pts.length);
    const [ox, oy] = centre(frag.map((i) => mol.atoms[i].location)), [nx, ny] = centre(out);
    frag.forEach((i, k) => {
      const [x, y] = out[k];
      atoms[i] = { ...atoms[i], location: [ox + (x - nx) * scale, oy + (y - ny) * scale, 0] };
    });
    // As ChemDraw's clean up leaves it: a ring structure turned so its bottom ring bond is level.
    const turn = levelTurn({ ...mol, atoms }, frag);
    if (turn) {
      const c = Math.cos((turn * Math.PI) / 180), s = Math.sin((turn * Math.PI) / 180);
      frag.forEach((i) => { const [x, y] = atoms[i].location; atoms[i] = { ...atoms[i], location: [ox + (x - ox) * c - (y - oy) * s, oy + (x - ox) * s + (y - oy) * c, 0] }; });
    }
  }
  return { ...mol, atoms };
}

// The pieces a mass-fragmentation cut makes: the cut bonds are taken out and every atom keeps the hydrogens it had
// in the whole molecule (a homolytic cleavage). Each piece that a cut bond touched, with its formula and exact mass.
export function fragmentMasses(mol: Mol, cut: number[]): { atoms: number[]; formula: string; exact: number }[] | undefined {
  if (!indigo || !cut.length) return undefined;
  const ind = indigo, full = expandLabels(mol), cutSet = new Set(cut);
  const used = full.atoms.map(() => 0);
  full.bonds.forEach((b) => b.atoms.forEach((i) => (used[i] += b.type)));
  const h = full.atoms.map((a, i) => a.implicitHCount ?? hydrogens(a.label, a.charge ?? 0, used[i], a.radical));
  // Pieces: atoms joined by the bonds that are not cut.
  const root = full.atoms.map((_, i) => i), find = (i: number): number => (root[i] === i ? i : (root[i] = find(root[i])));
  full.bonds.forEach((b, k) => { if (!cutSet.has(k)) root[find(b.atoms[0])] = find(b.atoms[1]); });
  const touched = new Set(cut.flatMap((k) => full.bonds[k] ? full.bonds[k].atoms.map(find) : []));
  const out: { atoms: number[]; formula: string; exact: number }[] = [];
  for (const r of touched) {
    const atoms = full.atoms.map((_, i) => i).filter((i) => find(i) === r), local = new Map(atoms.map((i, k) => [i, k]));
    const ket = JSON.stringify({ root: { nodes: [{ $ref: "mol0" }] }, mol0: { type: "molecule",
      atoms: atoms.map((i) => ({ label: full.atoms[i].label, location: full.atoms[i].location, implicitHCount: h[i], ...(full.atoms[i].charge ? { charge: full.atoms[i].charge } : {}) })),
      bonds: full.bonds.filter((b, k) => !cutSet.has(k) && local.has(b.atoms[0]) && local.has(b.atoms[1])).map((b) => ({ type: b.type, atoms: [local.get(b.atoms[0]), local.get(b.atoms[1])] })) } });
    const opts = new ind.MapStringString(), sel = new ind.VectorInt();
    try {
      const res = JSON.parse(ind.calculate(ket, opts, sel));
      out.push({ atoms: atoms.filter((i) => i < mol.atoms.length), formula: String(res["gross-formula"]).replace(/\s+/g, ""), exact: Number(res["monoisotopic-mass"]) });
    } catch {
      return undefined;
    } finally {
      opts.delete();
      sel.delete();
    }
  }
  return out;
}

// Atom map numbers for one reaction step, from Indigo's automapper: for each reactant and product (in order), each
// atom's number, or undefined where an atom has no partner. Written labels count as the element they attach by.
export function mapReaction(reactants: Mol[], products: Mol[]): { reactants: (number | undefined)[][]; products: (number | undefined)[][] } | undefined {
  if (!indigo || !reactants.length || !products.length) return undefined;
  const ind = indigo, opts = new ind.MapStringString();
  try {
    // A molfile keeps its first (name) line, so it is not trimmed.
    const molfile = (m: Mol) => {
      const o = new ind.MapStringString();
      try {
        return ind.convert(JSON.stringify({ root: { nodes: [{ $ref: "mol0" }] }, mol0: { type: "molecule",
          atoms: m.atoms.map((a) => ({ label: /^[A-Z][a-z]?$/.test(a.label) ? a.label : "C", location: a.location, ...(a.charge ? { charge: a.charge } : {}) })),
          bonds: m.bonds.map((b) => ({ type: Math.min(b.type, 3), atoms: b.atoms })) } }), "molfile", o).replace(/\s+$/, "");
      } finally { o.delete(); }
    };
    const rxn = ["$RXN", "", "  Octet", "", `${String(reactants.length).padStart(3)}${String(products.length).padStart(3)}`, ...[...reactants, ...products].flatMap((m) => ["$MOL", molfile(m)])].join("\n");
    opts.set("output-content-type", "application/json");
    const ket = JSON.parse(JSON.parse(ind.automap(rxn, "discard", "ket", opts)).struct);
    const mols = (ket.root.nodes as { $ref?: string }[]).flatMap((n) => (n.$ref && ket[n.$ref]?.type === "molecule" ? [ket[n.$ref].atoms.map((a: { mapping?: number }) => a.mapping)] : []));
    if (mols.length !== reactants.length + products.length) return undefined;
    return { reactants: mols.slice(0, reactants.length), products: mols.slice(reactants.length) };
  } catch {
    return undefined;
  } finally {
    opts.delete();
  }
}

// The Chemical Properties panel's values for each structure in a drawing (or a selection): formula, masses and
// composition from Indigo; Wildman–Crippen logP and molar refractivity from Indigo, one structure at a time (it adds
// a mixture's together); and the structure's graph for Octet's own calculators (props.ts).
export type Structure = { formula: string; weight: number; exact: number; composition: string; logP?: number; mr?: number; graph?: Graph; repeat?: Repeat };
const structured = new Map<string, Structure | undefined>();
export function structures(mol: Mol, groups = fragments(mol)): (Structure | undefined)[] | undefined {
  if (!indigo || !mol.atoms.length) return undefined;
  const ind = indigo, opts = new ind.MapStringString(), sel = new ind.VectorInt(), out: (Structure | undefined)[] = [];
  // Indigo reports a failed logP or MR as -1.
  const num = (s: string) => (s.trim() === "-1.000000" ? undefined : Number(s));
  try {
    for (const ids of groups.slice(0, 12)) {
      const part = subset(mol, new Set(ids));
      // A polymer: its repeat units counted as its brackets say (no logP or properties for a polymer).
      const polymer = polymerValues(part);
      if (polymer) { out.push(polymer); continue; }
      out.push(remembered(structured, contentOf(part), () => {
        try {
          const ket = ketOf(part, false), calc = JSON.parse(ind.calculate(ket, opts, sel));
          const heavy = expandLabels(part).atoms.filter((a) => a.label !== "H").length;
          // Ferrocene's pieces (its multi-centre attachments are left out of the chemistry) as one compound.
          const one = summed(calc);
          return {
            formula: one.formula, weight: one.weight, exact: one.exact, composition: one.composition,
            // ChemDraw stops at 150 heavy atoms for logP and 1,000 atoms for the rest; so does Octet.
            ...(heavy <= 150 ? { logP: num(ind.logp(ket, opts)), mr: num(ind.molarRefractivity(ket, opts)) } : {}),
            graph: heavy <= 1000 ? graphOf(expandLabels(part)) : undefined,
          };
        } catch { return undefined; } // a structure Indigo cannot read has no values
      }));
    }
    return out.some(Boolean) ? out : undefined;
  } finally {
    opts.delete();
    sel.delete();
  }
}

// Formula and masses for the drawing or a selection, one entry for each structure in it (the first limit of them),
// with written labels counted as their atoms. Each structure is worked out on its own and kept by its content.
// Undefined while Indigo is loading or if it cannot read any structure.
export type Analysis = { formula: string; weight: number; exact: number; repeat?: Repeat }[];
const analysed = new Map<string, Analysis | undefined>();
export function analyse(mol: Mol, limit = Infinity): Analysis | undefined {
  if (!indigo || !mol.atoms.length) return undefined;
  const out: Analysis = [];
  for (const part of pieces(mol)) {
    if (out.length >= limit) break;
    const polymer = mol.shapes?.some((sh) => sh.polymer) ? polymerValues({ ...part, shapes: mol.shapes }) : undefined;
    if (polymer) { out.push(polymer); continue; }
    const entries = remembered(analysed, contentOf(part), () => analyseAll(part)) ?? [];
    // A structure held together by multi-centre attachments (ferrocene) is one compound, not its pieces.
    if (entries.length > 1 && part.atoms.some((a) => a.centre)) {
      const total: Record<string, number> = {};
      for (const e of entries) for (const [el, n] of Object.entries(counts(e.formula) ?? {})) total[el] = (total[el] ?? 0) + n;
      out.push({ formula: hill(total), weight: entries.reduce((t, e) => t + e.weight, 0), exact: entries.reduce((t, e) => t + e.exact, 0) });
    } else out.push(...entries);
  }
  return out.length ? out.slice(0, limit) : undefined;
}
// Indigo's values for a molecule as one compound: its pieces ("C5 H5; C5 H5; Fe") added together.
function summed(calc: Record<string, unknown>): { formula: string; weight: number; exact: number; composition: string } {
  const split = (key: string) => String(calc[key]).split(";").map((v) => v.trim());
  const formulas = split("gross-formula");
  if (formulas.length === 1) return { formula: formulas[0].replace(/\s+/g, ""), weight: Number(calc["molecular-weight"]), exact: Number(calc["monoisotopic-mass"]), composition: String(calc["mass-composition"]) };
  const weights = split("molecular-weight").map(Number), counts: Record<string, number> = {}, masses: Record<string, number> = {};
  for (const f of formulas) for (const [el, n] of Object.entries(formulaCounts(f) ?? {})) counts[el] = (counts[el] ?? 0) + n;
  split("mass-composition").forEach((c, j) => { const t = c.split(/\s+/); for (let k = 0; k + 1 < t.length; k += 2) masses[t[k]] = (masses[t[k]] ?? 0) + (Number(t[k + 1]) * weights[j]) / 100; });
  const weight = weights.reduce((a, b) => a + b, 0);
  return { formula: hill(counts), weight, exact: split("monoisotopic-mass").map(Number).reduce((a, b) => a + b, 0), composition: Object.entries(masses).map(([el, w]) => `${el} ${((100 * w) / (weight || 1)).toFixed(2)}`).join(" ") };
}

// A polymer's formula and masses (ChemDraw's Bracket Properties): a multiple group's or parameterizable bracket's atoms
// counted as many times as it repeats (a parameterizable bracket's Mw sets its count), and an SRU's repeat unit apart
// from the end groups, as C2H6(C2H4)n. Where a bond crosses an SRU's bracket to a bare carbon with no other bond, the
// chain goes on: that carbon is not an end group (polyethylene drawn as –[CH2CH2]n– is (C2H4)n, not C4H10).
// Undefined for a structure with no such brackets. Each atom keeps the hydrogens it has in the whole structure.
export type Repeat = { label: string; weight: number; exact: number; ends?: { weight: number; exact: number } };
type Values = { formula: string; weight: number; exact: number; composition: string; repeat?: Repeat };
function polymerValues(part: Mol): Values | undefined {
  const brackets = polymerBrackets(part).filter((b) => ["sru", "mult", "param"].includes(b.sh.polymer!.usage));
  if (!brackets.length || !indigo) return undefined;
  const ind = indigo, { mol: x, from } = expandWithOrigins(part), used = x.atoms.map(() => 0), deg = part.atoms.map(() => 0);
  x.bonds.forEach((b) => b.atoms.forEach((i) => (used[i] += ORDER[b.type] ?? 1)));
  part.bonds.forEach((b) => b.atoms.forEach((i) => deg[i]++));
  const h = x.atoms.map((a, i) => a.implicitHCount ?? hydrogens(a.label, a.charge ?? 0, used[i], a.radical === 3 ? 2 : a.radical));
  const inOf = new Map<number, number>();
  brackets.forEach((b, k) => b.atoms.forEach((i) => { if (!inOf.has(i)) inOf.set(i, k); }));
  // Open ends: only at a repeat with no number (an SRU's n); a multiple group's end carbons are methyl groups.
  const numbered = brackets.map((b) => b.sh.polymer!.usage === "param" && !!b.sh.polymer!.mw || repeatCount(b.sh.polymer!) !== undefined);
  const open = new Set(part.atoms.flatMap((a, i) => (!inOf.has(i) && a.label === "C" && !a.text && !a.charge && !a.isotope && deg[i] === 1
    && part.bonds.some((b) => { const j = b.atoms[0] === i ? b.atoms[1] : b.atoms[0]; return b.atoms.includes(i) && inOf.has(j) && !numbered[inOf.get(j)!]; }) ? [i] : [])));
  // Formula, masses and composition of some of the expanded atoms, from Indigo.
  const calc = (atoms: number[]) => {
    if (!atoms.length) return { counts: {} as Record<string, number>, weight: 0, exact: 0, masses: {} as Record<string, number> };
    const local = new Map(atoms.map((i, k) => [i, k]));
    const ket = JSON.stringify({ root: { nodes: [{ $ref: "mol0" }] }, mol0: { type: "molecule",
      atoms: atoms.map((i) => ({ label: x.atoms[i].label, location: x.atoms[i].location, implicitHCount: h[i], ...(x.atoms[i].charge ? { charge: x.atoms[i].charge } : {}), ...(x.atoms[i].isotope ? { isotope: x.atoms[i].isotope } : {}) })),
      bonds: x.bonds.filter((b) => local.has(b.atoms[0]) && local.has(b.atoms[1])).map((b) => ({ type: Math.min(3, b.type), atoms: [local.get(b.atoms[0]), local.get(b.atoms[1])] })) } });
    const opts = new ind.MapStringString(), sel = new ind.VectorInt();
    try {
      // Indigo gives each piece apart ("C H3; C H3"): their sums.
      const r = JSON.parse(ind.calculate(ket, opts, sel)), split = (key: string) => String(r[key]).split(";").map((v) => v.trim());
      const weights = split("molecular-weight").map(Number), exacts = split("monoisotopic-mass").map(Number), masses: Record<string, number> = {}, counts: Record<string, number> = {};
      split("mass-composition").forEach((c, j) => { const t = c.split(/\s+/); for (let k = 0; k + 1 < t.length; k += 2) masses[t[k]] = (masses[t[k]] ?? 0) + (Number(t[k + 1]) * weights[j]) / 100; });
      for (const f of split("gross-formula")) { const c = formulaCounts(f); if (!c) return undefined; for (const [el, n] of Object.entries(c)) counts[el] = (counts[el] ?? 0) + n; }
      const weight = weights.reduce((a, b) => a + b, 0), exact = exacts.reduce((a, b) => a + b, 0);
      return Number.isFinite(weight) ? { counts, weight, exact, masses } : undefined;
    } catch { return undefined; } finally { opts.delete(); sel.delete(); }
  };
  const ends = calc(x.atoms.map((_, j) => j).filter((j) => !inOf.has(from[j]) && !open.has(from[j])));
  const units = brackets.map((b, k) => ({ p: b.sh.polymer!, v: calc(x.atoms.map((_, j) => j).filter((j) => inOf.get(from[j]) === k)) }));
  if (!ends || units.some((u) => !u.v)) return undefined;
  // Numbered repeats are counted into the rest; the first SRU or label repeat stays as its unit and label.
  const rest = { counts: { ...ends.counts }, weight: ends.weight, exact: ends.exact, masses: { ...ends.masses } };
  let symbolic: { label: string; v: NonNullable<ReturnType<typeof calc>> } | undefined, more = "";
  for (const u of units) {
    const k = repeatCount(u.p, u.v!.weight);
    if (k === undefined) {
      const label = polymerLabel(u.p) || "n";
      if (!symbolic) symbolic = { label, v: u.v! }; else more += `(${hill(u.v!.counts)})${label}`;
      continue;
    }
    for (const [el, c] of Object.entries(u.v!.counts)) rest.counts[el] = (rest.counts[el] ?? 0) + k * c;
    for (const [el, w] of Object.entries(u.v!.masses)) rest.masses[el] = (rest.masses[el] ?? 0) + k * w;
    rest.weight += k * u.v!.weight;
    rest.exact += k * u.v!.exact;
  }
  const compose = (masses: Record<string, number>, weight: number) => Object.entries(masses).map(([el, w]) => `${el} ${((100 * w) / (weight || 1)).toFixed(2)}`).join(" ");
  if (!symbolic) return { formula: hill(rest.counts), weight: rest.weight, exact: rest.exact, composition: compose(rest.masses, rest.weight) };
  const hasRest = Object.keys(rest.counts).length > 0;
  return {
    formula: `${hasRest ? hill(rest.counts) : ""}(${hill(symbolic.v.counts)})${symbolic.label}${more}`, weight: rest.weight + symbolic.v.weight, exact: rest.exact + symbolic.v.exact,
    composition: compose(symbolic.v.masses, symbolic.v.weight),
    repeat: { label: symbolic.label, weight: symbolic.v.weight, exact: symbolic.v.exact, ...(hasRest ? { ends: { weight: rest.weight, exact: rest.exact } } : {}) },
  };
}
// "C2 H4" as element counts.
function formulaCounts(f: string): Record<string, number> | undefined {
  const out: Record<string, number> = {};
  for (const t of f.trim().split(/\s+/)) {
    const m = /^([A-Z][a-z]?)(\d*)$/.exec(t);
    if (!m) return t ? undefined : out;
    out[m[1]] = (out[m[1]] ?? 0) + (m[2] ? Number(m[2]) : 1);
  }
  return out;
}
// Element counts in Hill order (C, H, then by symbol; by symbol alone with no carbon), fractional counts to 2 places.
function hill(counts: Record<string, number>): string {
  const els = Object.keys(counts).filter((el) => counts[el] > 1e-9).sort((a, b) => a.localeCompare(b, "en"));
  const order = counts.C ? ["C", ...(counts.H ? ["H"] : []), ...els.filter((e) => e !== "C" && e !== "H")] : els;
  return order.map((el) => { const n = counts[el], t = Math.abs(n - Math.round(n)) < 1e-9 ? String(Math.round(n)) : String(+n.toFixed(2)); return el + (t === "1" ? "" : t); }).join("");
}
// Each structure (atoms joined by bonds) on its own, in the drawing's order, with no atom left out.
function pieces(mol: Mol): Mol[] {
  const at: [number, number][] = [];
  const groups = fragments(mol).map((group, k) => {
    const ids = [...group].sort((a, b) => a - b);
    ids.forEach((i, j) => { at[i] = [k, j]; });
    return ids;
  });
  // A multi-centre or variable attachment's atoms, by their number in the piece.
  const parts = groups.map((ids, k) => ({ atoms: ids.map((i) => renumberCentre(mol.atoms[i], (j) => (at[j]?.[0] === k ? at[j][1] : undefined))), bonds: [] as Mol["bonds"] }));
  for (const b of mol.bonds) {
    const [p, q] = [at[b.atoms[0]], at[b.atoms[1]]];
    if (p && q) parts[p[0]].bonds.push({ ...b, atoms: [p[1], q[1]] });
  }
  return parts;
}
// A structure's content as text: what its formula, masses and properties come from (not where it is drawn).
const contentOf = (m: Mol) => JSON.stringify([m.atoms.map((a) => [a.label, a.text, a.charge, a.isotope, a.radical, a.implicitHCount, a.centre]), m.bonds.map((b) => [b.type, b.stereo, b.atoms])]);
// A value kept by its key, so it is worked out only once. The store is cleared when it grows large.
function remembered<T>(store: Map<string, T>, key: string, make: () => T): T {
  if (store.has(key)) return store.get(key) as T;
  if (store.size >= 500) store.clear();
  const value = make();
  store.set(key, value);
  return value;
}
// Formula and masses for each structure Indigo finds in a molecule, in one call. A structure with no formula or no
// weight (a label Indigo cannot read, alone) has no entry. Indigo gives no exact mass for a structure it reads as a
// bad valence: its exact mass is then not a number.
function analyseAll(mol: Mol): Analysis | undefined {
  const ind = engine(), opts = new ind.MapStringString(), sel = new ind.VectorInt();
  try {
    const ket = ketOf(mol, false);
    // Indigo reports each structure separately ("C8 H9 N O2; C4 H12 N"): one entry per structure.
    const out = JSON.parse(ind.calculate(ket, opts, sel));
    const split = (key: string) => String(out[key]).split(";").map((x) => x.trim());
    const formulas = split("gross-formula").map((f) => f.replace(/\s+/g, "")), weights = split("molecular-weight").map(Number), exacts = split("monoisotopic-mass").map(Number);
    return formulas.map((formula, k) => ({ formula, weight: weights[k], exact: exacts[k] })).filter((a) => a.formula && Number.isFinite(a.weight));
  } catch {
    return undefined;
  } finally {
    opts.delete();
    sel.delete();
  }
}

// A reagent's formula and molar mass from its SMILES (a reagent written as an abbreviation, such as MeOH or Et3N, read
// by labels.ts), kept by the SMILES. Undefined while Indigo is loading or if it cannot read it.
const reagents = new Map<string, { formula: string; weight: number } | undefined>();
export function smilesWeight(smiles: string): { formula: string; weight: number } | undefined {
  if (!indigo) return undefined;
  const ind = indigo;
  return remembered(reagents, smiles, () => {
    const opts = new ind.MapStringString(), sel = new ind.VectorInt();
    try { const one = summed(JSON.parse(ind.calculate(smiles, opts, sel))); return Number.isFinite(one.weight) && one.weight > 0 ? { formula: one.formula, weight: one.weight } : undefined; } catch { return undefined; } finally { opts.delete(); sel.delete(); }
  });
}
