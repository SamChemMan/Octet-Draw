// The library's Polyhedra and Carbon sets, worked out here from geometry: coordination geometries (M with its
// ligands L), cages (their hidden edges dashed), and carbon allotropes (C60 and nanotube segments, each atom at its place in 3D, kept as depth; a
// graphene flake), with Kekulé double bonds. Nothing comes from another program's files.
import { Drawing } from "./perspective.mjs";

const deg = Math.PI / 180;
const rotX = ([x, y, z], t) => [x, y * Math.cos(t) - z * Math.sin(t), y * Math.sin(t) + z * Math.cos(t)];
const rotY = ([x, y, z], t) => [x * Math.cos(t) + z * Math.sin(t), y, -x * Math.sin(t) + z * Math.cos(t)];
const entry = (name, also, mol) => ({ name, ...(also ? { also } : {}), mol });

// ——— Coordination geometries ———
// Drawn as chemists draw them: each ligand L at an angle on the page (degrees, anticlockwise from the right), its
// bond plain, a wedge (towards the viewer) or a hash (away), 1.7 bond lengths from M so a bond between two labels
// shows. The ligands are plain L, so a template takes any metal and ligand. [name, [[angle, bond]...], search words]
const REACH = 1.7;
const GEOMETRIES = [
  ["Linear", [[180], [0]], "ML2, two-coordinate, VSEPR"],
  ["Bent", [[218], [322]], "angular, ML2, VSEPR"],
  ["Trigonal planar", [[90], [210], [330]], "ML3, three-coordinate, VSEPR"],
  ["Trigonal pyramidal", [[205], [335, "hash"], [270, "wedge"]], "ML3, VSEPR, pyramidal"],
  ["T-shaped", [[180], [0], [270]], "ML3, VSEPR"],
  ["Tetrahedral", [[90], [210], [340, "wedge"], [295, "hash"]], "ML4, four-coordinate, VSEPR"],
  ["Square planar", [[0], [90], [180], [270]], "ML4, four-coordinate"],
  ["Seesaw", [[90], [270], [205, "wedge"], [335, "hash"]], "ML4, disphenoidal, VSEPR"],
  ["Trigonal bipyramidal", [[90], [270], [0], [215, "wedge"], [150, "hash"]], "ML5, five-coordinate, TBP, VSEPR"],
  ["Square pyramidal", [[90], [210, "wedge"], [330, "wedge"], [150, "hash"], [30, "hash"]], "ML5, five-coordinate, VSEPR"],
  ["Octahedral", [[90], [270], [210, "wedge"], [330, "wedge"], [150, "hash"], [30, "hash"]], "ML6, six-coordinate, VSEPR"],
  ["Pentagonal bipyramidal", [[90], [270], [0], [235, "wedge"], [305, "wedge"], [125, "hash"], [55, "hash"]], "ML7, seven-coordinate, VSEPR"],
];
function geometry([name, ligands, also]) {
  const d = new Drawing(), m = d.atom("M", [0, 0, 0]);
  // A wedge's narrow end is at M (the bond's first atom), so it widens towards the ligand in front.
  for (const [angle, bond] of ligands) d.bond(m, d.atom("L", [REACH * Math.cos(angle * deg), REACH * Math.sin(angle * deg), 0]), 1, bond === "wedge" ? { stereo: 1 } : bond === "hash" ? { stereo: 6 } : {});
  return entry(name, also, d.done());
}

// ——— Cages ———
// A cage seen turned and tilted, each corner a carbon at its place in 3D (so Clean Up leaves it as drawn). Its faces are worked out from the corners
// (the planes with every corner on one side); an edge with no face turned towards the viewer is behind the cage, and
// is drawn dashed, as chemists draw a cage's hidden edges.
function cage(name, also, points, turn, tilt) {
  const view = points.map((p) => rotX(rotY(p, turn * deg), tilt * deg)), n = view.length;
  const sub = (a, b) => a.map((v, k) => v - b[k]), dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const mid = view.reduce((m, p) => m.map((v, k) => v + p[k] / n), [0, 0, 0]);
  const faces = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) for (let k = j + 1; k < n; k++) {
    let nrm = cross(sub(view[j], view[i]), sub(view[k], view[i]));
    const l = Math.hypot(...nrm);
    if (l < 1e-9) continue;
    nrm = nrm.map((v) => v / l);
    if (dot(nrm, sub(view[i], mid)) < 0) nrm = nrm.map((v) => -v);
    const on = view.map((p) => dot(nrm, sub(p, view[i])));
    if (on.some((d) => d > 1e-6)) continue;
    const corners = on.flatMap((d, c) => (Math.abs(d) < 1e-6 ? [c] : []));
    if (!faces.some((f) => f.corners.join() === corners.join())) faces.push({ corners, front: nrm[2] > 1e-6 });
  }
  const d = new Drawing(), at = view.map((p) => d.atom("C", p));
  for (const [a, b] of edgesOf(points)) {
    const seen = faces.some((f) => f.front && f.corners.includes(a) && f.corners.includes(b));
    d.bond(at[a], at[b], 1, seen ? {} : { display: "dashed" });
  }
  return entry(name, also, d.done());
}
const prism = (k, r, h) => [0.5, -0.5].flatMap((y) => Array.from({ length: k }, (_, j) => [r * Math.cos((2 * Math.PI * j) / k + Math.PI / 2), y * h, r * Math.sin((2 * Math.PI * j) / k + Math.PI / 2)]));
function cages() {
  // A tetrahedron on its base (edge one bond length), its apex up, as it is drawn: the base's back edge hidden.
  const tetra = [[0, Math.sqrt(2 / 3) * 0.75, 0], ...[90, 210, 330].map((a) => [Math.cos(a * deg) / Math.sqrt(3), -Math.sqrt(2 / 3) * 0.25, Math.sin(a * deg) / Math.sqrt(3)])];
  const phi = (1 + Math.sqrt(5)) / 2, dodeca = [];
  for (const a of [-1, 1]) for (const b of [-1, 1]) for (const c of [-1, 1]) dodeca.push([a, b, c]);
  for (const a of [-1, 1]) for (const b of [-1, 1]) dodeca.push([0, a / phi, b * phi], [a / phi, b * phi, 0], [a * phi, 0, b / phi]);
  return [
    cage("Tetrahedrane", "C4H4, tetrahedron, cage", tetra, 10, 18),
    cage("Prismane", "Ladenburg benzene, C6H6, triangular prism, cage", prism(3, 1 / Math.sqrt(3), 1), 40, 28),
    cage("Pentaprismane", "C10H10, pentagonal prism, cage", prism(5, 1 / (2 * Math.sin(36 * deg)), 1), 10, 22),
    cage("Dodecahedrane", "C20H20, dodecahedron, cage, Platonic", dodeca.map((v) => v.map((x) => (x * phi) / 2)), 12, 20),
  ];
}

// ——— Carbon ———
// The edges of a set of points: every pair one bond length apart.
const edgesOf = (ps, l = 1) => ps.flatMap((p, i) => ps.slice(i + 1).flatMap((q, k) => (Math.abs(Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) - l) < 1e-6 ? [[i, i + 1 + k]] : [])));

// Kekulé double bonds: a perfect matching of the atoms (each in exactly one double bond), found by augmenting paths.
function kekule(n, edges) {
  const nb = Array.from({ length: n }, () => []);
  edges.forEach(([a, b], k) => { nb[a].push([b, k]); nb[b].push([a, k]); });
  const mate = new Array(n).fill(-1);
  const augment = (u, seen) => {
    for (const [v] of nb[u]) {
      if (seen[v]) continue;
      seen[v] = true;
      if (mate[v] < 0 || augment(mate[v], seen)) { mate[u] = v; mate[v] = u; return true; }
    }
    return false;
  };
  // Bipartite (every ring of a nanotube or flake is a hexagon), so one pass from each free atom of one side will do.
  const side = new Array(n).fill(-1);
  for (let s = 0; s < n; s++) if (side[s] < 0) { side[s] = 0; const q = [s]; while (q.length) { const u = q.shift(); for (const [v] of nb[u]) if (side[v] < 0) { side[v] = 1 - side[u]; q.push(v); } } }
  for (let u = 0; u < n; u++) if (side[u] === 0 && mate[u] < 0) augment(u, new Array(n).fill(false));
  return edges.map(([a, b]) => (mate[a] === b ? 2 : 1));
}
// C60 (truncated icosahedron, edge one bond length): its double bonds are the 30 bonds shared by two hexagons, the
// edges in no five-membered ring.
function c60() {
  const p = (1 + Math.sqrt(5)) / 2, raw = [];
  const perms = (v) => [v, [v[1], v[2], v[0]], [v[2], v[0], v[1]]];
  const signs = (v) => { let out = [[]]; for (const x of v) out = out.flatMap((o) => (x === 0 ? [[...o, 0]] : [[...o, x], [...o, -x]])); return out; };
  for (const base of [[0, 1, 3 * p], [1, 2 + p, 2 * p], [p, 2, p ** 3]]) for (const v of perms(base)) raw.push(...signs(v));
  const ps = raw.map((v) => v.map((x) => x / 2)); // edge 2 in these coordinates
  const edges = edgesOf(ps);
  const nb = ps.map((_, i) => edges.flatMap(([a, b]) => (a === i ? [b] : b === i ? [a] : [])));
  // In a pentagon: a path of four more steps back to the start.
  const inPentagon = ([a, b]) => nb[b].some((c) => c !== a && nb[c].some((d) => d !== b && d !== a && nb[d].some((e) => e !== c && e !== b && nb[e].includes(a))));
  const d = new Drawing(), at = ps.map((q) => d.atom("C", rotX(rotY(q, 12 * deg), 18 * deg)));
  edges.forEach(([a, b]) => d.bond(at[a], at[b], inPentagon([a, b]) ? 1 : 2));
  return entry("C60", "buckminsterfullerene, fullerene, buckyball", d.done());
}
// A nanotube segment: graphene (bond length 1) rolled so the chiral vector (n, m) goes round it, `cells` translation
// periods long, seen along a tilted axis so its front and back walls do not lie on each other.
function nanotube(n, m, cells, name, also) {
  const a1 = [Math.sqrt(3), 0], a2 = [Math.sqrt(3) / 2, 1.5], add = (p, q) => [p[0] + q[0], p[1] + q[1]], mul = (p, s) => [p[0] * s, p[1] * s];
  const C = add(mul(a1, n), mul(a2, m)), Cl = Math.hypot(...C), R = Cl / (2 * Math.PI);
  const g = (x, y) => (y ? g(y, x % y) : x), dR = g(2 * m + n, 2 * n + m), T = add(mul(a1, (2 * m + n) / dR), mul(a2, -(2 * n + m) / dR)), Tl = Math.hypot(...T);
  const cu = mul(C, 1 / Cl), tu = mul(T, 1 / Tl), pts = [];
  const span = n + m + cells * 4 + 4;
  for (let i = -span; i <= span; i++) for (let j = -span; j <= span; j++) for (const b of [[0, 0], [0, 1]]) {
    const p = add(add(mul(a1, i), mul(a2, j)), b), u = p[0] * cu[0] + p[1] * cu[1], v = p[0] * tu[0] + p[1] * tu[1];
    if (u >= -1e-6 && u < Cl - 1e-6 && v >= -1e-6 && v < cells * Tl - 1e-6) pts.push([u, v]);
  }
  // Bonds: neighbours one bond length apart on the unrolled sheet, the seam joined round the tube.
  const edges = [];
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
    const dv = pts[i][1] - pts[j][1], du = Math.abs(pts[i][0] - pts[j][0]), d = Math.min(Math.hypot(du, dv), Math.hypot(Cl - du, dv));
    if (Math.abs(d - 1) < 1e-4) edges.push([i, j]);
  }
  // Atoms with one bond at the ends would dangle: leave them out, then renumber.
  const deg1 = new Set(pts.map((_, i) => i).filter((i) => edges.filter((e) => e.includes(i)).length < 2));
  const keep = pts.map((_, i) => i).filter((i) => !deg1.has(i)), index = new Map(keep.map((i, k) => [i, k]));
  const kept = edges.filter(([a, b]) => index.has(a) && index.has(b)).map(([a, b]) => [index.get(a), index.get(b)]);
  const orders = kekule(keep.length, kept);
  if (orders.filter((o) => o === 2).length * 2 !== keep.length) throw new Error(`${name}: no Kekulé structure`);
  const d = new Drawing();
  const at = keep.map((i) => { const [u, v] = pts[i], t = (2 * Math.PI * u) / Cl; return d.atom("C", rotX(rotY([v - (cells * Tl) / 2, R * Math.cos(t + 0.2), R * Math.sin(t + 0.2)], 14 * deg), 6 * deg)); });
  kept.forEach(([a, b], k) => d.bond(at[a], at[b], orders[k]));
  return entry(name, also, d.done());
}
// A flat graphene flake: the hexagons within `rings` steps of the middle one (coronene is 1, circumcoronene 2), their
// corners its atoms, with a Kekulé structure.
function flake(rings, name, also) {
  const corners = new Map();
  for (let i = -rings; i <= rings; i++) for (let j = -rings; j <= rings; j++) {
    if (Math.max(Math.abs(i), Math.abs(j), Math.abs(i + j)) > rings) continue;
    const cx = i * Math.sqrt(3) + j * (Math.sqrt(3) / 2), cy = j * 1.5;
    for (let k = 0; k < 6; k++) { const t = (30 + 60 * k) * deg, x = cx + Math.cos(t), y = cy + Math.sin(t); corners.set(`${Math.round(x * 1000) + 0},${Math.round(y * 1000) + 0}`, [x, y]); }
  }
  const pts = [...corners.values()], edges = [];
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) if (Math.abs(Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]) - 1) < 1e-6) edges.push([i, j]);
  const orders = kekule(pts.length, edges);
  if (orders.filter((o) => o === 2).length * 2 !== pts.length) throw new Error(`${name}: no Kekulé structure`);
  const d = new Drawing(), at = pts.map(([x, y]) => d.atom("C", [x, y, 0]));
  edges.forEach(([a, b], k) => d.bond(at[a], at[b], orders[k]));
  return entry(name, also, d.done());
}

export const POLYHEDRA = [...GEOMETRIES.map(geometry), ...cages()];
export const CARBON = [c60(), nanotube(5, 5, 6, "(5,5) Nanotube", "armchair, carbon nanotube, CNT"), nanotube(9, 0, 4, "(9,0) Nanotube", "zigzag, carbon nanotube, CNT"),
  flake(2, "Circumcoronene", "graphene, C54H18, nanographene")];
