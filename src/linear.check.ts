// Run: node src/linear.check.ts. Fails loudly if Clean Up Structure leaves a linear group bent, or its drawing breaks
// a bond or puts a charge sign on one (Sam, 26 October 2026: methyl 2-diazo-2-phenylacetate after Clean Up showed the
// N+ sign where the N=N bond leaves, and the bond as a dotted line). Each structure is laid out from SMILES, cleaned,
// and drawn as cleaned and as its mirror image, with Arial-like glyphs (letters as their ink boxes, + as two bars and
// the minus as one, from Arial's metrics):
// - the atom between two double bonds, or a triple and a single bond, is straight, to 0.1°;
// - every bond is the bond length, to 0.1%;
// - every bond is drawn, each of its lines as one piece (one polygon per line);
// - no charge sign comes within the label margin of a drawn bond, and no bond is shorter than it is with the charges
//   taken off (their atoms keeping their hydrogens).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { arialGlyph } from "./cdxml.ts";
import { hydrogens, orderOf, render, type Drawing, type Ink, type Mol } from "./render.ts";

// chem.ts reads the drawing tokens and loads Indigo's wasm as a browser does; these stand in for the browser.
const g = globalThis as Record<string, unknown>;
g.document = { documentElement: {}, createElement: () => ({ getContext: () => ({}) }) };
g.getComputedStyle = () => ({ getPropertyValue: () => "10" });
g.window = globalThis;
g.self = { location: { origin: "file://" } };
g.fetch = async (u: URL | string) => new Response(readFileSync(new URL(String(u))), { headers: { "content-type": "application/wasm" } });
const { cleanUp, parseStructure, ready } = await import("./chem.ts");
await ready;

type P = [number, number];
const pt = 4 / 3;
const S = { bond: 14.4 * pt, line: 0.6 * pt, bold: 2 * pt, spacing: 0.18 * 14.4 * pt, hash: 2.5 * pt, margin: 1.69 * pt, size: 10 * pt };
// Arial-like glyphs: each letter or digit its ink box (cap height, or x-height for short letters), + two bars and the
// en dash one bar, at Arial's advances, ink edges and heights.
const box = (out: P[], x0: number, y0: number, x1: number, y1: number) => { for (let k = 0; k <= 12; k++) { const f = k / 12; out.push([x0 + (x1 - x0) * f, -y0], [x0 + (x1 - x0) * f, -y1], [x0, -y0 - (y1 - y0) * f], [x1, -y0 - (y1 - y0) * f]); } };
const arial = (text: string): Ink => {
  const outline: P[] = [], z = S.size;
  let x = 0, top = 0;
  for (const ch of text) {
    const [w, l, r] = arialGlyph(ch).map((v) => (v * z) / 1000), c = x + (l + r) / 2;
    if (ch === "+") { box(outline, x + l, 0.3125 * z, x + r, 0.3925 * z); box(outline, c - 0.04 * z, 0.116 * z, c + 0.04 * z, 0.589 * z); top = Math.max(top, 0.589 * z); }
    else if (ch === "–") box(outline, x + l, 0.224 * z, x + r, 0.294 * z);
    else { const h = /[acemnorsuvwxz]/.test(ch) ? 0.519 * z : 0.716 * z; box(outline, x + l, 0, x + r, h); top = Math.max(top, h); }
    x += w;
  }
  return { width: x, ascent: top, outline };
};

const structures: [string, string][] = [
  ["methyl 2-diazo-2-phenylacetate", "COC(=O)C(=[N+]=[N-])c1ccccc1"],
  ["ethyl diazoacetate", "CCOC(=O)C=[N+]=[N-]"],
  ["phenyl azide", "[N-]=[N+]=Nc1ccccc1"],
  ["benzonitrile oxide", "[O-][N+]#Cc1ccccc1"],
  ["phenyl isocyanate", "O=C=Nc1ccccc1"],
  ["phenyl isothiocyanate", "S=C=Nc1ccccc1"],
  ["dimethylketene", "CC(C)=C=O"],
  ["penta-2,3-diene", "CC=C=CC"],
  ["carbon dioxide", "O=C=O"],
  ["dicyclohexylcarbodiimide", "C1CCC(CC1)N=C=NC1CCCCC1"],
  ["benzonitrile", "N#Cc1ccccc1"],
  ["1-phenylpropyne", "CC#Cc1ccccc1"],
  ["benzenediazonium", "N#[N+]c1ccccc1"],
];
const deg = 180 / Math.PI;
let straight = 0, signs = 0;
for (const [name, smiles] of structures) {
  const cleaned = cleanUp(parseStructure(smiles));
  for (const [how, mol] of [["cleaned", cleaned], ["mirrored", { ...cleaned, atoms: cleaned.atoms.map((a) => ({ ...a, location: [-a.location[0], a.location[1], 0] as [number, number, number] })) }]] as [string, Mol][]) {
    const what = `${name}, ${how}`, at = (i: number) => mol.atoms[i].location;
    const nbrs = mol.atoms.map((_, i) => mol.bonds.filter((b) => b.atoms.includes(i)));
    // Straight: an atom with two double bonds, or a triple and a single bond.
    mol.atoms.forEach((_, i) => {
      const orders = nbrs[i].map((b) => b.type).sort().join();
      if (orders !== "2,2" && orders !== "1,3") return;
      const [p, q] = nbrs[i].map((b) => at(b.atoms[0] === i ? b.atoms[1] : b.atoms[0])), u = [p[0] - at(i)[0], p[1] - at(i)[1]], v = [q[0] - at(i)[0], q[1] - at(i)[1]];
      const angle = Math.abs(Math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1])) * deg;
      assert.ok(Math.abs(angle - 180) < 0.1, `${what}: ${mol.atoms[i].label}${i} is straight (${angle.toFixed(3)}°)`);
      straight++;
    });
    for (const b of mol.bonds) {
      const l = Math.hypot(at(b.atoms[1])[0] - at(b.atoms[0])[0], at(b.atoms[1])[1] - at(b.atoms[0])[1]);
      assert.ok(Math.abs(l - 1) < 1e-3, `${what}: every bond is the bond length (${l.toFixed(5)})`);
    }
    // Each bond in its own colour, so its polygons can be told apart.
    const colour = (k: number) => `#0000${k.toString(16).padStart(2, "0")}`, coloured = { ...mol, bonds: mol.bonds.map((b, k) => ({ ...b, colour: colour(k) })) };
    const d = render(coloured, S, arial);
    // How long each bond is drawn: its longest line, along the bond.
    const drawn = (dr: Drawing, k: number) => {
      const [i, j] = mol.bonds[k].atoms, X = [at(i)[0] * dr.scale, -at(i)[1] * dr.scale], Y = [at(j)[0] * dr.scale, -at(j)[1] * dr.scale], l = Math.hypot(Y[0] - X[0], Y[1] - X[1]);
      const along = (q: P) => ((q[0] - X[0]) * (Y[0] - X[0]) + (q[1] - X[1]) * (Y[1] - X[1])) / l;
      return Math.max(0, ...dr.polygons.filter((_, n) => dr.colours[n] === colour(k)).map((poly) => Math.max(...poly.map(along)) - Math.min(...poly.map(along))));
    };
    const used = mol.atoms.map((_, i) => nbrs[i].reduce((n, b) => n + orderOf(b.type), 0));
    const neutral = render({ ...coloured, atoms: mol.atoms.map((a, i) => (a.charge ? { ...a, charge: undefined, implicitHCount: hydrogens(a.label, a.charge, used[i]) } : a)) }, S, arial);
    mol.bonds.forEach((b, k) => {
      const pieces = d.colours.filter((c) => c === colour(k)).length;
      assert.equal(pieces, b.type === 3 ? 3 : b.type === 2 ? 2 : 1, `${what}: bond ${k} (${b.type === 3 ? "triple" : b.type === 2 ? "double" : "single"}) drawn as one piece per line`);
      assert.ok(drawn(d, k) >= drawn(neutral, k) - 0.01, `${what}: bond ${k} drawn ${(drawn(d, k) / pt).toFixed(2)} pt, as long as without its charges (${(drawn(neutral, k) / pt).toFixed(2)} pt)`);
    });
    // A sign's ink (where the label is drawn) stays the margin clear of every bond polygon's edges.
    for (const l of d.labels.filter((x) => /^\d*[+–]$/.test(x.text))) {
      const k = l.size / S.size, ink = arial(l.text).outline.map(([x, y]): P => [l.x + x * k, l.y + y * k]);
      const xs = ink.map((q) => q[0]), ys = ink.map((q) => q[1]), b = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
      let near = Infinity;
      d.polygons.forEach((poly, j) => {
        if (!d.colours[j]) return; // a mark, not a bond
        poly.forEach((p, n) => {
          const q = poly[(n + 1) % poly.length];
          for (let s = 0; s <= 40; s++) {
            const x = p[0] + ((q[0] - p[0]) * s) / 40, y = p[1] + ((q[1] - p[1]) * s) / 40;
            near = Math.min(near, Math.hypot(Math.max(b[0] - x, 0, x - b[2]), Math.max(b[1] - y, 0, y - b[3])));
          }
        });
      });
      assert.ok(near >= S.margin - 0.05, `${what}: its ${l.text} sign is ${(near / pt).toFixed(2)} pt from the nearest bond (margin ${(S.margin / pt).toFixed(2)} pt)`);
      signs++;
    }
  }
}
console.log(`linear.check: ${structures.length} structures and their mirror images, ${straight} straight atoms, ${signs} charge signs clear of their bonds`);

// Every bond style from a charged label (NH3+) to a carbon, both ways round and every 30°, and the bond orders and bold
// from N+ to O-: drawn, nothing within the label margin of the labels' ink (their signs too), each solid line in one
// piece. (Between two labels, the dative bond's head and the hashed and hollow wedges' wide ends come closer than the
// margin, as they did before charge signs moved.)
{
  const styles: [string, Partial<Mol["bonds"][number]>, number][] = [
    ["single", {}, 1], ["double", { type: 2 }, 2], ["triple", { type: 3 }, 3], ["bold", { display: "bold" }, 1], ["wedge", { stereo: 1 }, 1], ["hashed wedge", { stereo: 6 }, 0], ["wavy", { display: "wavy" }, 1],
    ["dashed", { display: "dashed" }, 0], ["dative", { display: "dative" }, 2], ["hollow wedge", { display: "hollow" }, 3], ["hashed", { display: "hashed" }, 0], ["hydrogen bond", { type: 10 }, 0],
  ];
  let bonds = 0;
  for (const [k, [name, more, pieces]] of styles.entries()) for (let t = 0; t < 360; t += 30) for (const other of ["C", "C back", ...(k < 4 ? ["O-"] : [])]) {
    const far = { label: other[0], location: [Math.cos(t / deg), Math.sin(t / deg), 0] as [number, number, number], ...(other === "O-" ? { charge: -1 } : {}) };
    const mol: Mol = { atoms: [{ label: "N", charge: 1, location: [0, 0, 0] }, far], bonds: [{ type: 1, atoms: other === "C back" ? [1, 0] : [0, 1], ...more }] };
    const d = render(mol, S, arial), what = `${name} from N+ to ${other} at ${t}°`;
    assert.ok(d.polygons.length >= Math.max(1, pieces) && (!pieces || d.polygons.length === pieces), `${what}: drawn, its solid lines in one piece each (${d.polygons.length} polygons)`);
    const ink = d.labels.flatMap((l) => arial(l.text).outline.map(([x, y]): P => [l.x + (x * l.size) / S.size, l.y + (y * l.size) / S.size]));
    let near = Infinity;
    for (const poly of d.polygons) poly.forEach((p, n) => {
      const q = poly[(n + 1) % poly.length];
      for (let s = 0; s <= 20; s++) { const x = p[0] + ((q[0] - p[0]) * s) / 20, y = p[1] + ((q[1] - p[1]) * s) / 20; for (const r of ink) near = Math.min(near, Math.hypot(r[0] - x, r[1] - y)); }
    });
    assert.ok(near >= S.margin - 0.05, `${what}: ${(near / pt).toFixed(2)} pt from the labels' ink (margin ${(S.margin / pt).toFixed(2)} pt)`);
    bonds++;
  }
  console.log(`linear.check: ${bonds} bonds in ${styles.length} styles drawn clear of charged labels, solid lines in one piece`);
}
