// Dev preview: test molecules at 200% (?gallery), or one molecule (?smiles=…). Used to check the renderer.
import { useEffect, useState } from "react";
import { parseStructure, ready, STYLE, measure } from "./chem";
import { render, type Mol } from "./render";

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
const ZOOM = 2;

function Structure({ smiles }: { smiles: string }) {
  const [mol, setMol] = useState<Mol>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    ready.then(() => setMol(parseStructure(smiles))).catch((e) => setError(String(e)));
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

export default function Gallery({ smiles }: { smiles?: string }) {
  const items = smiles ? [["", smiles]] : GALLERY;
  return (
    // data-theme="light": the canvas stays white in dark mode, for print fidelity.
    <main data-theme="light" style={{ minHeight: "100vh", background: "var(--canvas)", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: 32, padding: 32, boxSizing: "border-box" }}>
      {items.map(([name, s]) => (
        <figure key={s} style={{ margin: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <Structure smiles={s} />
          {name && <figcaption className="text-caption" style={{ color: "var(--ink-muted)", maxWidth: 240, textAlign: "center" }}>{name}</figcaption>}
        </figure>
      ))}
    </main>
  );
}
