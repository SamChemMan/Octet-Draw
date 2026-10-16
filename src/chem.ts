// The chemistry engine (Indigo) and the drawing style, shared by the editor and the dev gallery.
import Indigo from "indigo-ketcher/binaryWasmNoRender";
import type { Ink, Mol } from "./render";
import { labelSmiles } from "./labels";

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

function engine() {
  if (!indigo) throw new Error("Indigo is not loaded yet");
  return indigo;
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
