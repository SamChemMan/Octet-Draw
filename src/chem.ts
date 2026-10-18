// The chemistry engine (Indigo) and the drawing style, shared by the editor and the dev gallery.
import Indigo from "indigo-ketcher/binaryWasmNoRender";
import { HBOND, hydrogens, orderOf, QUADRUPLE, type Face, type Ink, type Mol } from "./render.ts";
import { fontStack } from "./docstyle.ts";
import { labelSmiles } from "./labels.ts";
import { fragments, levelTurn, subset } from "./edit.ts";
import { graphOf, type Graph } from "./naming.ts";
import { clean2d } from "./clean2d.ts";

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

// A KET atom as Octet's: KET radicals 2 and 3 are one and two unpaired electrons.
const atomOfKet = (a: { label: string; location: [number, number, number]; charge?: number; radical?: number }): Mol["atoms"][number] =>
  ({ label: a.label, location: a.location, charge: a.charge, ...(a.radical ? { radical: a.radical === 1 ? 3 : a.radical - 1 } : {}), ...((a as { isotope?: number }).isotope ? { isotope: (a as { isotope?: number }).isotope } : {}) });

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

// A structure file (MOL, SDF, CDXML, KET, SMILES), keeping the file's own drawing where it has one.
// Coordinates are scaled so the median bond is one bond length; SMILES (no drawing) is laid out.
// Throws a RangeError, with the reason to show, for text over Octet's limits.
export function importStructure(text: string): Mol {
  if (text.length > MOST_CHARACTERS) throw over(MOST_CHARACTERS, "characters");
  const ind = engine(), opts = new ind.MapStringString();
  try {
    opts.set("output-content-type", "application/json");
    opts.set("dearomatize-on-load", "true");
    const hasDrawing = /V2000|V3000|<CDXML|"root"/.test(text);
    if (!hasDrawing) return parseStructure(text);
    const ket = JSON.parse(JSON.parse(ind.convert(text, "ket", opts)).struct);
    const mol: Mol = { atoms: [], bonds: [] };
    for (const { $ref } of ket.root.nodes as { $ref: string }[]) {
      const frag = ket[$ref];
      if (frag?.type !== "molecule") continue;
      const base = mol.atoms.length;
      mol.atoms.push(...frag.atoms.map(atomOfKet));
      mol.bonds.push(...frag.bonds.map((b: Mol["bonds"][number]) => ({ type: b.type, atoms: [b.atoms[0] + base, b.atoms[1] + base], stereo: b.stereo })));
    }
    const lengths = mol.bonds.map((b) => Math.hypot(mol.atoms[b.atoms[1]].location[0] - mol.atoms[b.atoms[0]].location[0], mol.atoms[b.atoms[1]].location[1] - mol.atoms[b.atoms[0]].location[1])).sort((a, b) => a - b);
    const k = 1 / (lengths[Math.floor(lengths.length / 2)] || 1);
    return { ...mol, atoms: mol.atoms.map((a) => ({ ...a, location: [a.location[0] * k, a.location[1] * k, (a.location[2] ?? 0) * k] })) };
  } finally {
    opts.delete();
  }
}

// SMILES (or a MOL file) to a laid-out molecule with Kekulé bonds and stereo wedges. All fragments are kept.
// Throws a RangeError, with the reason to show, for text over Octet's limits.
export function parseStructure(text: string): Mol {
  // SMILES is one line, counted as written (Indigo reads a long SMILES slowly); a MOL file or other file, through Indigo.
  const file = /^[{<]|[\r\n]/.test(text.trim()), most = file ? MOST_CHARACTERS : MOST_SMILES;
  if (text.length > most) throw over(most, "characters");
  const atoms = smilesAtoms(file ? convert(text, "smiles") : text);
  if (atoms > MOST_ATOMS) throw over(MOST_ATOMS, "atoms");
  const ind = engine(), opts = new ind.MapStringString();
  try {
    opts.set("output-content-type", "application/json");
    opts.set("dearomatize-on-load", "true");
    opts.set("layout-max-iterations", String(Math.min(50, Math.max(10, Math.round(4000 / atoms)))));
    const ket = JSON.parse(JSON.parse(ind.layout(text, "ket", opts)).struct);
    const out: Mol = { atoms: [], bonds: [] };
    for (const { $ref } of ket.root.nodes as { $ref: string }[]) {
      const frag = ket[$ref];
      if (frag?.type !== "molecule") continue;
      const base = out.atoms.length;
      out.atoms.push(...frag.atoms.map(atomOfKet));
      out.bonds.push(...frag.bonds.map((b: Mol["bonds"][number]) => ({ type: b.type, atoms: [b.atoms[0] + base, b.atoms[1] + base], stereo: b.stereo })));
    }
    return out;
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
  mol.atoms.forEach((a, i) => {
    // A multi-centre point (an η ligand's) is not an atom: it and its bond are left out.
    if (a.centre) { out.atoms[i] = { ...out.atoms[i], removed: true } as Mol["atoms"][number]; return; }
    // An attachment point (wavy, diamond or star) or a polymer bead is not an atom either, but its bond takes up its
    // neighbour's valence: it is a pseudo-atom ("*"), which counts in no formula, mass or analysis.
    if (a.attach || a.bead) { out.atoms[i] = { ...out.atoms[i], label: "*", text: undefined, isotope: undefined, charge: undefined }; return; }
    if (!a.text) return;
    const frag = a.chemical === false ? undefined : labelGroup(a.text);
    if (!frag?.atoms.length) { out.atoms[i] = { ...out.atoms[i], label: "*", text: undefined }; return; }
    const base = out.atoms.length;
    origin.push(...frag.atoms.map(() => i));
    // The group's first atom takes the label atom's place: bonds to the label atom move to it. The kept group's atoms
    // are copied, so no change to the result can change it.
    out = {
      atoms: [...out.atoms, ...frag.atoms.map((x) => ({ ...x }))],
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
// A drawing as KET, with labels expanded into atoms. KET has no bond display styles (bold, wavy and so on).
// Hydrogen bonds are left out (they are not chemistry Indigo works out), unless hbonds asks for them; a quadruple
// bond, which Indigo has no type for, goes as a single bond. expanded: the molecule with its labels expanded already.
function ketOf(drawn: Mol, hbonds = false, expanded?: Mol): string {
  const mol = expanded ?? expandLabels(!hbonds && drawn.bonds.some((b) => b.type === HBOND) ? { ...drawn, bonds: drawn.bonds.filter((b) => b.type !== HBOND) } : drawn);
  const bonds = mol.bonds.map(({ type: t, atoms, stereo }) => { const type = t === QUADRUPLE ? 1 : t; return stereo ? { type, atoms, stereo } : { type, atoms }; });
  // KET radicals: 1 a singlet, 2 one unpaired electron (doublet), 3 two (triplet).
  const atoms = mol.atoms.map(({ label, location, charge, radical, isotope }) => ({ label, location, ...(charge ? { charge } : {}), ...(radical ? { radical: radical === 3 ? 1 : radical + 1 } : {}), ...(isotope ? { isotope } : {}) }));
  return JSON.stringify({ root: { nodes: [{ $ref: "mol0" }] }, mol0: { type: "molecule", atoms, bonds } });
}
// Only the end is trimmed: a molfile's first line (its name) is blank, and without it no program reads the file.
function convert(input: string, format: string): string {
  const ind = engine(), opts = new ind.MapStringString();
  try {
    return ind.convert(input, format, opts).trimEnd();
  } finally {
    opts.delete();
  }
}
export const toSmiles = (drawn: Mol): string => convert(ketOf(drawn), "smiles");
// The drawing's molecules as a molfile. A hydrogen bond is bond type 10 and a quadruple bond single, as ChemDraw
// writes them.
export const toMolfile = (drawn: Mol): string => convert(ketOf(drawn, true), "molfile");
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
    const part = (): Mol => ({ atoms: ids.map((i) => mol.atoms[i]), bonds: bonds[k].map((n) => ({ ...mol.bonds[n], atoms: mol.bonds[n].atoms.map((i) => local.get(i)!) as [number, number] })) });
    return { ids, bonds: bonds[k], key: `${atoms.join(",")};${bs.join(",")}`, part };
  });
}
// Show Stereochemistry's labels, in the drawing's own atom and bond order: R, S (and r, s) on stereocentres and E, Z
// on double bonds. Each structure is labelled on its own (Indigo splits a drawing into molecules), and only once
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
    const { from } = expandWithOrigins(part), ket = JSON.parse(JSON.parse(ind.calculateCip(ketOf(part), "ket", opts)).struct).mol0;
    if (!ket || ket.atoms.length !== from.length) return null;
    const atoms: (string | undefined)[] = part.atoms.map(() => undefined);
    ket.atoms.forEach((a: { cip?: string }, k: number) => { if (clean(a.cip) && !part.atoms[from[k]].text) atoms[from[k]] = clean(a.cip); });
    // ketOf leaves hydrogen bonds out, so Indigo's bonds are the others, in order.
    let n = 0;
    return { atoms, bonds: part.bonds.map((b) => (b.type === HBOND ? undefined : clean(ket.bonds[n++]?.cip))) };
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

// A bond's type for a layout: a hydrogen or quadruple bond as a single bond, as Indigo has no type for them.
const shapeType = (type: number) => (type === HBOND || type === QUADRUPLE ? 1 : Math.min(type, 3));
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
  const groups = fragments(mol).filter((frag) => frag.length > 1 && frag.length <= MOST_CLEAN && (!ids?.size || frag.some((i) => ids.has(i))));
  for (const frag of groups) {
    const local = new Map(frag.map((i, k) => [i, k]));
    const bonds = mol.bonds.filter((b) => local.has(b.atoms[0]) && local.has(b.atoms[1]));
    const out = clean2d(frag.map((i) => mol.atoms[i].location), bonds.map((b) => ({ atoms: [local.get(b.atoms[0])!, local.get(b.atoms[1])!], order: shapeType(b.type) })), pass * Math.min(1, 2 / groups.length));
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
  full.bonds.forEach((b) => b.atoms.forEach((i) => (used[i] += orderOf(b.type))));
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
      bonds: full.bonds.filter((b, k) => !cutSet.has(k) && local.has(b.atoms[0]) && local.has(b.atoms[1])).map((b) => ({ type: b.type === QUADRUPLE ? 1 : b.type, atoms: [local.get(b.atoms[0]), local.get(b.atoms[1])] })) } });
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
          bonds: m.bonds.filter((b) => b.type !== HBOND).map((b) => ({ type: shapeType(b.type), atoms: b.atoms })) } }), "molfile", o).replace(/\s+$/, "");
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
export type Structure = { formula: string; weight: number; exact: number; composition: string; logP?: number; mr?: number; graph?: Graph };
const structured = new Map<string, Structure | undefined>();
export function structures(mol: Mol, groups = fragments(mol)): (Structure | undefined)[] | undefined {
  if (!indigo || !mol.atoms.length) return undefined;
  const ind = indigo, opts = new ind.MapStringString(), sel = new ind.VectorInt(), out: (Structure | undefined)[] = [];
  // Indigo reports a failed logP or MR as -1.
  const num = (s: string) => (s.trim() === "-1.000000" ? undefined : Number(s));
  try {
    for (const ids of groups.slice(0, 12)) {
      const part = subset(mol, new Set(ids));
      out.push(remembered(structured, contentOf(part), () => {
        try {
          const ket = ketOf(part), calc = JSON.parse(ind.calculate(ket, opts, sel));
          const heavy = expandLabels(part).atoms.filter((a) => a.label !== "H").length;
          return {
            formula: String(calc["gross-formula"]).replace(/\s+/g, ""), weight: Number(calc["molecular-weight"]), exact: Number(calc["monoisotopic-mass"]),
            composition: String(calc["mass-composition"]),
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
export type Analysis = { formula: string; weight: number; exact: number }[];
const analysed = new Map<string, Analysis | undefined>();
export function analyse(mol: Mol, limit = Infinity): Analysis | undefined {
  if (!indigo || !mol.atoms.length) return undefined;
  const out: Analysis = [];
  for (const part of pieces(mol)) {
    if (out.length >= limit) break;
    out.push(...(remembered(analysed, contentOf(part), () => analyseAll(part)) ?? []));
  }
  return out.length ? out.slice(0, limit) : undefined;
}
// Each structure (atoms joined by bonds) on its own, in the drawing's order, with no atom left out.
function pieces(mol: Mol): Mol[] {
  const at: [number, number][] = [];
  const parts = fragments(mol).map((group, k) => {
    const ids = [...group].sort((a, b) => a - b);
    ids.forEach((i, j) => { at[i] = [k, j]; });
    return { atoms: ids.map((i) => mol.atoms[i]), bonds: [] as Mol["bonds"] };
  });
  for (const b of mol.bonds) {
    const [p, q] = [at[b.atoms[0]], at[b.atoms[1]]];
    if (p && q) parts[p[0]].bonds.push({ ...b, atoms: [p[1], q[1]] });
  }
  return parts;
}
// A structure's content as text: what its formula, masses and properties come from (not where it is drawn).
const contentOf = (m: Mol) => JSON.stringify([m.atoms.map((a) => [a.label, a.text, a.charge, a.isotope, a.radical, a.implicitHCount, a.chemical, a.attach, a.bead]), m.bonds.map((b) => [b.type, b.stereo, b.atoms])]);
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
    // A quadruple bond goes as a single bond (Indigo has no type for it), so its structure still has a formula.
    const full = expandLabels(mol), bonds = full.bonds.map(({ type, atoms }) => ({ type: type === QUADRUPLE ? 1 : type, atoms }));
    const atoms = full.atoms.map(({ label, location, charge, isotope }) => ({ label, location, ...(charge ? { charge } : {}), ...(isotope ? { isotope } : {}) }));
    const ket = JSON.stringify({ root: { nodes: [{ $ref: "mol0" }] }, mol0: { type: "molecule", atoms, bonds } });
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
