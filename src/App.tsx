import { useEffect, useState } from "react";
import Indigo from "indigo-ketcher/binaryWasmNoRender";
import { render, type Mol } from "./render";

const indigo = Indigo();
// Drawing sizes come from brand/tokens.css (ACS 1996).
const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name);
const pt = (name: string) => (parseFloat(token(name)) * 4) / 3; // pt to px
const BOND = pt("--bond-length");
const STYLE = {
  bond: BOND,
  spacing: (parseFloat(token("--bond-spacing")) / 100) * BOND,
  margin: pt("--margin-width"),
  bold: pt("--bond-bold"),
  hash: pt("--hash-spacing"),
  size: pt("--atom-label-size"),
};
const ctx = document.createElement("canvas").getContext("2d")!;
ctx.font = `${STYLE.size}px ${token("--atom-label-font")}`;
const measure = (text: string) => {
  const m = ctx.measureText(text);
  return { left: m.actualBoundingBoxLeft, right: m.actualBoundingBoxRight, ascent: m.actualBoundingBoxAscent, descent: m.actualBoundingBoxDescent, width: m.width };
};

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
      <g fill="none" stroke="var(--ink)" strokeLinecap="butt" strokeLinejoin="miter" style={{ strokeWidth: "var(--bond-width)" }}>
        {d.paths.map((path, i) => <path key={i} d={path} />)}
        {d.lines.map(([p, q], i) => <line key={i} x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} />)}
      </g>
      {d.wedges.map((w, i) => <polygon key={i} points={w.map((p) => p.join(",")).join(" ")} fill="var(--ink)" />)}
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
