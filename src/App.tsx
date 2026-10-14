import { useEffect, useState } from "react";
import Indigo from "indigo-ketcher/binaryWasmNoRender";

type Atom = { label: string; location: [number, number, number] };
type Bond = { type: number; atoms: [number, number] };
type Mol = { atoms: Atom[]; bonds: Bond[] };

const indigo = Indigo();
// Drawing sizes come from brand/tokens.css (ACS 1996). KET bonds are 1 unit long.
const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name);
const pt = (name: string) => (parseFloat(token(name)) * 4) / 3; // pt to px
const BOND = pt("--bond-length");
const LABEL = pt("--atom-label-size");
const SPACING = (parseFloat(token("--bond-spacing")) / 100) * BOND;

// ponytail: reads the first fragment only; multi-fragment KET comes with file open
async function toMol(smiles: string): Promise<Mol> {
  const ind = await indigo;
  const opts = new ind.MapStringString();
  opts.set("output-content-type", "application/json");
  const ket = JSON.parse(JSON.parse(ind.convert(smiles, "ket", opts)).struct);
  opts.delete();
  return ket.mol0;
}

export default function App() {
  const [mol, setMol] = useState<Mol>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    toMol("CN1C=NC2=C1C(=O)N(C(=O)N2C)C").then(setMol, (e) => setError(String(e)));
  }, []);

  if (error) return <p>{error}</p>;
  if (!mol) return <p>Loading Indigo…</p>;

  const pts = mol.atoms.map((a) => [a.location[0] * BOND, -a.location[1] * BOND]); // KET y points up
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const [x0, y0] = [Math.min(...xs) - BOND, Math.min(...ys) - BOND];
  const [w, h] = [Math.max(...xs) - x0 + BOND, Math.max(...ys) - y0 + BOND];

  return (
    <svg viewBox={`${x0} ${y0} ${w} ${h}`} style={{ width: "100vw", height: "100vh", display: "block" }}>
      <g stroke="var(--ink)" strokeLinecap="round" style={{ strokeWidth: "var(--bond-width)" }}>
        {mol.bonds.flatMap((b, i) => {
          const [[px, py], [qx, qy]] = [pts[b.atoms[0]], pts[b.atoms[1]]];
          const len = Math.hypot(qx - px, qy - py);
          const [nx, ny] = [(py - qy) / len, (qx - px) / len];
          // ponytail: centred multiple bonds; ChemDraw-style inner ring lines come with the real renderer
          const offsets = b.type === 2 ? [-SPACING / 2, SPACING / 2] : b.type === 3 ? [-SPACING, 0, SPACING] : [0];
          return offsets.map((o) => (
            <line key={`${i}:${o}`} x1={px + nx * o} y1={py + ny * o} x2={qx + nx * o} y2={qy + ny * o} />
          ));
        })}
      </g>
      {mol.atoms.map(
        (a, i) =>
          a.label !== "C" && (
            <g key={i} transform={`translate(${pts[i][0]} ${pts[i][1]})`}>
              <circle r={LABEL * 0.6} fill="var(--canvas)" />
              <text
                textAnchor="middle"
                dominantBaseline="central"
                fill="var(--ink)"
                style={{ font: "500 var(--atom-label-size) var(--font-sans)" }}
              >
                {a.label}
              </text>
            </g>
          ),
      )}
    </svg>
  );
}
