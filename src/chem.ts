// The chemistry engine (Indigo) and the drawing style, shared by the editor and the dev gallery.
import Indigo from "indigo-ketcher/binaryWasmNoRender";
import type { Ink, Mol } from "./render";
import { labelSmiles } from "./labels";
import { fragments } from "./edit";

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
export function measure(text: string): Ink {
  const cached = inks.get(text);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  const g = canvas.getContext("2d", { willReadFrequently: true })!;
  g.font = `${STYLE.size}px ${FONT}`;
  const m = g.measureText(text);
  const pad = 2, baseline = STYLE.size * 1.2;
  const w = (canvas.width = Math.ceil((m.width + 2 * pad) * SCALE)), h = (canvas.height = Math.ceil(STYLE.size * 1.6 * SCALE));
  g.font = `${STYLE.size * SCALE}px ${FONT}`;
  g.fillText(text, pad * SCALE, baseline * SCALE);
  const alpha = g.getImageData(0, 0, w, h).data;
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && alpha[(y * w + x) * 4 + 3] > 127;
  const outline: [number, number][] = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (on(x, y) && !(on(x - 1, y) && on(x + 1, y) && on(x, y - 1) && on(x, y + 1)))
        outline.push([(x + 0.5) / SCALE - pad, (y + 0.5) / SCALE - baseline]);
  const ink = { width: m.width, ascent: m.actualBoundingBoxAscent, outline };
  inks.set(text, ink);
  return ink;
}

// A caption line's advance width in px, in the caption font.
const CAPTION_FONT = token("--caption-font");
const widths = new Map<string, number>();
const meter = document.createElement("canvas").getContext("2d")!;
export function textWidth(text: string, size: number, bold?: boolean, italic?: boolean): number {
  const font = `${italic ? "italic " : ""}${bold ? "bold " : ""}${size}px ${CAPTION_FONT}`, key = `${font}|${text}`;
  let w = widths.get(key);
  if (w === undefined) { meter.font = font; w = meter.measureText(text).width; widths.set(key, w); }
  return w;
}
export { CAPTION_FONT };

function engine() {
  if (!indigo) throw new Error("Indigo is not loaded yet");
  return indigo;
}

// A structure file (MOL, SDF, CDXML, KET, SMILES), keeping the file's own drawing where it has one.
// Coordinates are scaled so the median bond is one bond length; SMILES (no drawing) is laid out.
export function importStructure(text: string): Mol {
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
      mol.atoms.push(...frag.atoms.map((a: Mol["atoms"][number]) => ({ label: a.label, location: a.location, charge: a.charge })));
      mol.bonds.push(...frag.bonds.map((b: Mol["bonds"][number]) => ({ type: b.type, atoms: [b.atoms[0] + base, b.atoms[1] + base], stereo: b.stereo })));
    }
    const lengths = mol.bonds.map((b) => Math.hypot(mol.atoms[b.atoms[1]].location[0] - mol.atoms[b.atoms[0]].location[0], mol.atoms[b.atoms[1]].location[1] - mol.atoms[b.atoms[0]].location[1])).sort((a, b) => a - b);
    const k = 1 / (lengths[Math.floor(lengths.length / 2)] || 1);
    return { ...mol, atoms: mol.atoms.map((a) => ({ ...a, location: [a.location[0] * k, a.location[1] * k, 0] })) };
  } finally {
    opts.delete();
  }
}

// SMILES (or a MOL file) to a laid-out molecule with Kekulé bonds and stereo wedges. All fragments are kept.
export function parseStructure(text: string): Mol {
  const ind = engine(), opts = new ind.MapStringString();
  try {
    opts.set("output-content-type", "application/json");
    opts.set("dearomatize-on-load", "true");
    const ket = JSON.parse(JSON.parse(ind.layout(text, "ket", opts)).struct);
    const out: Mol = { atoms: [], bonds: [] };
    for (const { $ref } of ket.root.nodes as { $ref: string }[]) {
      const frag = ket[$ref];
      if (frag?.type !== "molecule") continue;
      const base = out.atoms.length;
      out.atoms.push(...frag.atoms.map((a: Mol["atoms"][number]) => ({ label: a.label, location: a.location, charge: a.charge })));
      out.bonds.push(...frag.bonds.map((b: Mol["bonds"][number]) => ({ type: b.type, atoms: [b.atoms[0] + base, b.atoms[1] + base], stereo: b.stereo })));
    }
    return out;
  } finally {
    opts.delete();
  }
}

// Written labels (OMe, CO2Et, Ph) as real atoms, for chemistry. Each label's group is read by Indigo and joined
// where the label atom was. A label Octet cannot read stays as a pseudo-atom ("*").
function expandLabels(mol: Mol): Mol {
  let out: Mol = { atoms: mol.atoms.map((a) => ({ ...a })), bonds: mol.bonds.map((b) => ({ ...b })) };
  mol.atoms.forEach((a, i) => {
    if (!a.text) return;
    const smiles = labelSmiles(a.text);
    if (!smiles) { out.atoms[i] = { ...out.atoms[i], label: "*", text: undefined }; return; }
    const frag = parseStructure(smiles), base = out.atoms.length;
    // The group's first atom takes the label atom's place: bonds to the label atom move to it.
    out = {
      atoms: [...out.atoms, ...frag.atoms],
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
  return { atoms: out.atoms.filter((_, k) => keep[k]), bonds: out.bonds.map((b) => ({ ...b, atoms: [map[b.atoms[0]], map[b.atoms[1]]] as [number, number] })) };
}

// The drawing as SMILES. Throws if Indigo can't read it (for example, a valence it rejects).
export function toSmiles(drawn: Mol): string {
  const mol = expandLabels(drawn);
  const ind = engine(), opts = new ind.MapStringString();
  try {
    // KET has no bond display styles (bold, wavy and so on); SMILES ignores them anyway.
    const bonds = mol.bonds.map(({ type, atoms, stereo }) => (stereo ? { type, atoms, stereo } : { type, atoms }));
    const atoms = mol.atoms.map(({ label, location, charge }) => (charge ? { label, location, charge } : { label, location }));
    const ket = { root: { nodes: [{ $ref: "mol0" }] }, mol0: { type: "molecule", atoms, bonds } };
    return ind.convert(JSON.stringify(ket), "smiles", opts).trim();
  } finally {
    opts.delete();
  }
}

// Clean Up Structure: Indigo straightens bond lengths and angles, structure by structure. Each structure the
// selection touches (or every structure, with nothing selected) is cleaned whole, scaled back to one bond
// length per bond, and kept centred where it was.
export function cleanUp(mol: Mol, ids?: Set<number>): Mol {
  const ind = engine(), atoms = mol.atoms.map((a) => ({ ...a }));
  for (const frag of fragments(mol)) {
    if (frag.length < 2 || (ids?.size && !frag.some((i) => ids.has(i)))) continue;
    const local = new Map(frag.map((i, k) => [i, k]));
    const bonds = mol.bonds.filter((b) => local.has(b.atoms[0]) && local.has(b.atoms[1]));
    const ket = {
      root: { nodes: [{ $ref: "mol0" }] },
      mol0: {
        type: "molecule",
        atoms: frag.map((i) => ({ label: /^[A-Z][a-z]?$/.test(mol.atoms[i].label) ? mol.atoms[i].label : "C", location: mol.atoms[i].location })),
        bonds: bonds.map((b) => ({ type: Math.min(b.type, 3), atoms: [local.get(b.atoms[0])!, local.get(b.atoms[1])!], ...(b.stereo ? { stereo: b.stereo } : {}) })),
      },
    };
    const opts = new ind.MapStringString(), sel = new ind.VectorInt();
    try {
      opts.set("output-content-type", "application/json");
      frag.forEach((_, k) => sel.push_back(k));
      const out = JSON.parse(JSON.parse(ind.clean2d(JSON.stringify(ket), "ket", opts, sel)).struct).mol0.atoms as { location: number[] }[];
      if (out.length !== frag.length) continue;
      const lengths = bonds.map((b) => {
        const [p, q] = [out[local.get(b.atoms[0])!].location, out[local.get(b.atoms[1])!].location];
        return Math.hypot(q[0] - p[0], q[1] - p[1]);
      }).sort((a, b) => a - b);
      const scale = 1 / (lengths[Math.floor(lengths.length / 2)] || 1);
      const centre = (pts: number[][]) => [0, 1].map((k) => pts.reduce((sum, p) => sum + p[k], 0) / pts.length);
      const [ox, oy] = centre(frag.map((i) => mol.atoms[i].location)), [nx, ny] = centre(out.map((a) => a.location));
      frag.forEach((i, k) => {
        const [x, y] = out[k].location;
        atoms[i] = { ...atoms[i], location: [ox + (x - nx) * scale, oy + (y - ny) * scale, 0] };
      });
    } finally {
      opts.delete();
      sel.delete();
    }
  }
  return { ...mol, atoms };
}

// Formula and masses for the drawing or a selection, with written labels counted as their atoms.
// Undefined while Indigo is loading or if it cannot read the structure.
export type Analysis = { formula: string; weight: number; exact: number }[];
export function analyse(mol: Mol): Analysis | undefined {
  if (!indigo || !mol.atoms.length) return undefined;
  const ind = indigo, full = expandLabels(mol), opts = new ind.MapStringString(), sel = new ind.VectorInt();
  try {
    const bonds = full.bonds.map(({ type, atoms }) => ({ type, atoms }));
    const atoms = full.atoms.map(({ label, location, charge }) => (charge ? { label, location, charge } : { label, location }));
    const ket = JSON.stringify({ root: { nodes: [{ $ref: "mol0" }] }, mol0: { type: "molecule", atoms, bonds } });
    // Indigo reports each structure separately ("C8 H9 N O2; C4 H12 N"): one entry per structure.
    const out = JSON.parse(ind.calculate(ket, opts, sel));
    const split = (key: string) => String(out[key]).split(";").map((x) => x.trim());
    const formulas = split("gross-formula").map((f) => f.replace(/\s+/g, "")), weights = split("molecular-weight").map(Number), exacts = split("monoisotopic-mass").map(Number);
    return formulas.map((formula, k) => ({ formula, weight: weights[k], exact: exacts[k] }));
  } catch {
    return undefined;
  } finally {
    opts.delete();
    sel.delete();
  }
}
