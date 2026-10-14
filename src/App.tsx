import { useEffect, useState } from "react";
import Indigo from "indigo-ketcher/binaryWasmNoRender";

type Atom = { label: string; location: [number, number, number] };
type Bond = { type: number; atoms: [number, number] };
type Mol = { atoms: Atom[]; bonds: Bond[] };

const indigo = Indigo();
const SCALE = 40; // px per bond; KET bonds are 1 unit long

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

  const pts = mol.atoms.map((a) => [a.location[0] * SCALE, -a.location[1] * SCALE]); // KET y points up
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const [x0, y0] = [Math.min(...xs) - SCALE, Math.min(...ys) - SCALE];
  const [w, h] = [Math.max(...xs) - x0 + SCALE, Math.max(...ys) - y0 + SCALE];

  return (
    <svg viewBox={`${x0} ${y0} ${w} ${h}`} style={{ width: "100vw", height: "100vh" }}>
      <g stroke="black" strokeWidth={1.5} strokeLinecap="round">
        {mol.bonds.flatMap((b, i) => {
          const [[px, py], [qx, qy]] = [pts[b.atoms[0]], pts[b.atoms[1]]];
          const len = Math.hypot(qx - px, qy - py);
          const [nx, ny] = [(py - qy) / len, (qx - px) / len];
          // ponytail: centred multiple bonds; ChemDraw-style inner ring lines come with the real renderer
          const offsets = b.type === 2 ? [-3, 3] : b.type === 3 ? [-5, 0, 5] : [0];
          return offsets.map((o) => (
            <line key={`${i}:${o}`} x1={px + nx * o} y1={py + ny * o} x2={qx + nx * o} y2={qy + ny * o} />
          ));
        })}
      </g>
      {mol.atoms.map(
        (a, i) =>
          a.label !== "C" && (
            <g key={i} transform={`translate(${pts[i][0]} ${pts[i][1]})`}>
              <circle r={9} fill="white" />
              <text textAnchor="middle" dominantBaseline="central" fontFamily="system-ui" fontSize={14}>
                {a.label}
              </text>
            </g>
          ),
      )}
    </svg>
  );
}
