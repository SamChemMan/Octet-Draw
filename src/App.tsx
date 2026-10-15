import { useEffect, useState } from "react";
import Indigo from "indigo-ketcher/binaryWasmNoRender";
import { render, type Ink, type Mol } from "./render";

const indigo = Indigo();
// Drawing sizes come from brand/tokens.css (ACS 1996).
const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name);
const pt = (name: string) => (parseFloat(token(name)) * 4) / 3; // pt to px
const BOND = pt("--bond-length");
const STYLE = {
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
function measure(text: string): Ink {
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

// ponytail: reads the first fragment only; multi-fragment KET comes with file open
async function toMol(smiles: string): Promise<Mol> {
  const ind = await indigo;
  const opts = new ind.MapStringString();
  opts.set("output-content-type", "application/json");
  opts.set("dearomatize-on-load", "true"); // Kekulé bonds: ACS draws aromatic rings with alternating double bonds
  const ket = JSON.parse(JSON.parse(ind.layout(smiles, "ket", opts)).struct); // layout also adds stereo wedges
  opts.delete();
  return ket.mol0;
}

// Dev preview: a gallery of test molecules at 200%, or ?smiles=… for one.
const GALLERY: [string, string][] = [
  ["Caffeine", "CN1C=NC2=C1C(=O)N(C(=O)N2C)C"],
  ["Imidazole", "c1cnc[nH]1"],
  ["L-Phenylalanine", "N[C@@H](Cc1ccccc1)C(=O)O"],
  ["Aspirin", "CC(=O)Oc1ccccc1C(=O)O"],
  ["Indole", "c1ccc2c(c1)cc[nH]2"],
  ["4-Nitrobenzonitrile", "N#Cc1ccc(cc1)[N+](=O)[O-]"],
  ["Glycine (zwitterion)", "[NH3+]CC(=O)[O-]"],
  ["Cumyl cation", "C[C+](C)c1ccccc1"],
  ["2-Bromo-4-chloro-1-(trifluoromethyl)benzene", "FC(F)(F)c1ccc(Cl)cc1Br"],
];
const ONE = new URLSearchParams(location.search).get("smiles");
const ZOOM = 2;

function Structure({ smiles }: { smiles: string }) {
  const [mol, setMol] = useState<Mol>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    toMol(smiles).then(setMol, (e) => setError(String(e)));
  }, [smiles]);

  if (error) return <p>{error}</p>;
  if (!mol) return <p>Loading Indigo…</p>;

  const d = render(mol, STYLE, measure);
  const [x0, y0, x1, y1] = d.box;
  return (
    <svg viewBox={`${x0} ${y0} ${x1 - x0} ${y1 - y0}`} width={(x1 - x0) * ZOOM} height={(y1 - y0) * ZOOM} style={{ display: "block" }}>
      <path d={d.polygons.map((poly) => "M" + poly.map(([x, y]) => `${x.toFixed(3)} ${y.toFixed(3)}`).join("L") + "Z").join("")} fill="var(--ink)" />
      {d.labels.map((l, i) => (
        <text key={i} x={l.x} y={l.y} fill="var(--ink)" style={{ font: `${l.size}px var(--atom-label-font)` }}>
          {l.text}
        </text>
      ))}
    </svg>
  );
}

export default function App() {
  const items = ONE ? [["", ONE]] : GALLERY;
  return (
    // data-theme="light": the canvas stays white in dark mode, for print fidelity.
    <main data-theme="light" style={{ minHeight: "100vh", background: "var(--canvas)", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: 32, padding: 32, boxSizing: "border-box" }}>
      {items.map(([name, smiles]) => (
        <figure key={smiles} style={{ margin: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <Structure smiles={smiles} />
          {name && <figcaption className="text-caption" style={{ color: "var(--ink-muted)", maxWidth: 240, textAlign: "center" }}>{name}</figcaption>}
        </figure>
      ))}
    </main>
  );
}
