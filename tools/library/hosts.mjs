// Macrocyclic hosts Indigo's flat layout draws badly (rings over their own OH groups, crossing bonds): calixarenes,
// pillar[5]arene, the cyclodextrins and the cucurbiturils drawn flat as papers draw them (each ring round a polygon or a
// circle, below), and [2.2]paracyclophane in perspective (each atom at its place in 3D, kept as depth, decision 0012),
// its two rings face to face. The 3D one is
// built from rings placed by simple geometry, then relaxed so every bond is one bond length and every angle near its
// ideal (120° at an aromatic atom, 109.5° otherwise), with atoms that are not bonded kept apart, and seen from the
// clearest side. Nothing comes from another program's files.
import { render } from "../../src/render.ts";
import { arial, STYLE } from "./clashes.mjs";
import { add, deg, Drawing, len, mul, rotX, rotY, sub } from "./perspective.mjs";

// A molecule being built: atoms ([label, place]) and bonds ([a, b, order]).
export class Build {
  constructor() { this.atoms = []; this.bonds = []; }
  atom(label, at) { this.atoms.push({ label, at }); return this.atoms.length - 1; }
  bond(a, b, order = 1) { this.bonds.push([a, b, order]); return this; }
  // A benzene ring about centre c in the plane of the unit vectors u and t (its first atom at c - u, the ring going
  // round towards t), Kekulé double bonds from its first atom. Returns its six atoms.
  ring(c, u, t) {
    const at = Array.from({ length: 6 }, (_, k) => { const a = (k * 60) * deg; return this.atom("C", add(c, add(mul(u, -Math.cos(a)), mul(t, Math.sin(a))))); });
    for (let k = 0; k < 6; k++) this.bond(at[k], at[(k + 1) % 6], k % 2 ? 1 : 2);
    return at;
  }
  // Relaxed: bonds to one bond length, angles to their ideal (as the distance across them), non-bonded atoms at least
  // 1.6 bond lengths apart, by small steps. more: [a, b, distance] for pairs with a distance of their own.
  relax(steps = 4000, more = []) {
    const n = this.atoms.length, nb = Array.from({ length: n }, () => []);
    for (const [a, b, o] of this.bonds) { nb[a].push([b, o]); nb[b].push([a, o]); }
    const flat = (i) => nb[i].some(([, o]) => o === 2); // an aromatic (Kekulé) or double-bonded atom
    const pairs = new Map(), key = (a, b) => (a < b ? `${a},${b}` : `${b},${a}`);
    for (const [a, b] of this.bonds) pairs.set(key(a, b), 1);
    for (let i = 0; i < n; i++) for (const [a] of nb[i]) for (const [b] of nb[i]) if (a < b && !pairs.has(key(a, b))) pairs.set(key(a, b), flat(i) ? Math.sqrt(3) : 1.633);
    for (const [a, b, d] of more) pairs.set(key(a, b), d);
    const list = [...pairs].map(([k, d]) => [...k.split(",").map(Number), d]);
    const p = this.atoms.map((a) => [...a.at]);
    for (let s = 0; s < steps; s++) {
      const f = p.map(() => [0, 0, 0]);
      for (const [a, b, d] of list) { const v = sub(p[b], p[a]), l = len(v) || 1e-6, k = (l - d) / l * 0.5; f[a] = add(f[a], mul(v, k)); f[b] = add(f[b], mul(v, -k)); }
      if (s % 10 === 0) for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
        if (pairs.has(key(a, b))) continue;
        const v = sub(p[b], p[a]), l = len(v);
        if (l < 1.6) { const k = ((l - 1.6) / (l || 1e-6)) * 0.5; f[a] = add(f[a], mul(v, k)); f[b] = add(f[b], mul(v, -k)); }
      }
      for (let a = 0; a < n; a++) p[a] = add(p[a], mul(f[a], 0.25));
    }
    this.atoms.forEach((a, i) => { a.at = p[i]; });
    return this;
  }
  // The clearest view seen from above (tilted 10° to 60°, turned to any side): no bond seen nearly end on (Octet
  // would draw its back atom as a Newman circle), and the atoms that are not bonded as far apart on the page as they go.
  view() {
    const n = this.atoms.length, bonded = new Set(this.bonds.map(([a, b]) => `${Math.min(a, b)},${Math.max(a, b)}`));
    let best = [0, 30], most = -Infinity;
    for (let turn = 0; turn < 360; turn += 4) for (let tilt = 10; tilt <= 60; tilt += 4) {
      const q = this.atoms.map((a) => rotX(rotY(a.at, turn * deg), tilt * deg));
      const shortest = Math.min(...this.bonds.map(([a, b]) => Math.hypot(q[a][0] - q[b][0], q[a][1] - q[b][1])));
      if (shortest < 0.45) continue;
      let near = Infinity;
      for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) if (!bonded.has(`${a},${b}`)) near = Math.min(near, Math.hypot(q[a][0] - q[b][0], q[a][1] - q[b][1]));
      if (near > most) { most = near; best = [turn, tilt]; }
    }
    return best;
  }
  // As a library drawing, seen turned about the page's y axis then tilted about its x axis (degrees); the clearest
  // view when none is given.
  drawing(turn, tilt) {
    if (turn === undefined) [turn, tilt] = this.view();
    const d = new Drawing(), at = this.atoms.map((a) => d.atom(a.label, rotX(rotY(a.at, turn * deg), tilt * deg)));
    for (const [a, b, o] of this.bonds) d.bond(at[a], at[b], o);
    return d.done();
  }
  // The longest bond's and the shortest bond's lengths, to check the relaxing.
  lengths() { const ls = this.bonds.map(([a, b]) => len(sub(this.atoms[a].at, this.atoms[b].at))); return [Math.min(...ls), Math.max(...ls)]; }
}

// [2.2]Paracyclophane: two benzene rings face to face, each para pair joined by CH2CH2.
function paracyclophane() {
  const m = new Build(), rings = [-1.3, 1.3].map((y) => m.ring([0, y, 0], [1, 0, 0], [0, 0, 1]));
  for (const k of [0, 3]) {
    const s = k ? -1 : 1, a = m.atom("C", [-s * 1.45, -0.55, 0]), b = m.atom("C", [-s * 1.45, 0.55, 0]);
    m.bond(rings[0][k], a).bond(a, b).bond(b, rings[1][k]);
  }
  return m.relax();
}

// Calix[4]arene flat, as it is drawn in papers: the four phenols round a square, each ring pointing out, its OH in to
// the middle, the CH2 bridges at the corners (their bonds 1.3 bond lengths, so the four OH clear each other).
function flatCalixarene(tBu) {
  const d = new Drawing(), D = 3, rings = [];
  for (let i = 0; i < 4; i++) {
    const a = i * 90 * deg, out = [Math.cos(a), Math.sin(a)], t = [-Math.sin(a), Math.cos(a)];
    // Ring atoms from C1 (inner, with the OH) round: C1 at D - 1, C4 at D + 1 along out.
    const at = Array.from({ length: 6 }, (_, k) => { const w = (k * 60) * deg, r = -Math.cos(w), s = Math.sin(w); return d.atom("C", [out[0] * (D + r) + t[0] * s, out[1] * (D + r) + t[1] * s, 0]); });
    for (let k = 0; k < 6; k++) d.bond(at[k], at[(k + 1) % 6], k % 2 ? 1 : 2);
    d.bond(at[0], d.atom("O", [out[0] * (D - 2), out[1] * (D - 2), 0]));
    if (tBu) {
      const q = d.atom("C", [out[0] * (D + 2), out[1] * (D + 2), 0]);
      d.bond(at[3], q);
      for (const w of [-60, 0, 60]) { const c = Math.cos(w * deg), sn = Math.sin(w * deg); d.bond(q, d.atom("C", [out[0] * (D + 2) + (out[0] * c - out[1] * sn), out[1] * (D + 2) + (out[0] * sn + out[1] * c), 0])); }
    }
    rings.push(at);
  }
  for (let i = 0; i < 4; i++) {
    const a = (i * 90 + 45) * deg, c = d.atom("C", [2.1 * Math.SQRT2 * Math.cos(a), 2.1 * Math.SQRT2 * Math.sin(a), 0]);
    d.bond(rings[i][1], c).bond(c, rings[(i + 1) % 4][5]);
  }
  return d.done();
}

// Pillar[5]arene flat: five dimethoxybenzenes round a pentagon, each ring's 2 and 5 positions on the pentagon's side
// (joined by the CH2 bridges at its corners), one OMe out and one in.
function flatPillararene() {
  const d = new Drawing(), n = 5, D = 3.6, rings = [];
  for (let i = 0; i < n; i++) {
    const a = (90 + (360 / n) * i) * deg, out = [Math.cos(a), Math.sin(a)], t = [-Math.sin(a), Math.cos(a)];
    // C1 to C6 at 120°, 180°, 240°, 300°, 0° and 60° about the ring's middle, measured from t towards out.
    const at = [120, 180, 240, 300, 0, 60].map((w) => d.atom("C", [out[0] * D + t[0] * Math.cos(w * deg) + out[0] * Math.sin(w * deg), out[1] * D + t[1] * Math.cos(w * deg) + out[1] * Math.sin(w * deg), 0]));
    for (let k = 0; k < 6; k++) d.bond(at[k], at[(k + 1) % 6], k % 2 ? 1 : 2);
    for (const [k, w] of [[0, 120], [3, 300]]) {
      const dir = [t[0] * Math.cos(w * deg) + out[0] * Math.sin(w * deg), t[1] * Math.cos(w * deg) + out[1] * Math.sin(w * deg)], [x, y] = d.atoms[at[k]].location;
      const o = d.atom("O", [x + dir[0], y + dir[1], 0]), turn = (k ? -60 : 60) * deg;
      d.bond(at[k], o).bond(o, d.atom("C", [x + dir[0] + dir[0] * Math.cos(turn) - dir[1] * Math.sin(turn), y + dir[1] + dir[0] * Math.sin(turn) + dir[1] * Math.cos(turn), 0]));
    }
    rings.push(at);
  }
  for (let i = 0; i < n; i++) {
    const [p, q] = [d.atoms[rings[i][4]].location, d.atoms[rings[(i + 1) % n][1]].location], m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], l = Math.hypot(...m);
    const c = d.atom("C", [m[0] * (l + 0.45) / l, m[1] * (l + 0.45) / l, 0]);
    d.bond(rings[i][4], c).bond(c, rings[(i + 1) % n][1]);
  }
  return d.done();
}

// ——— Cyclodextrins (issue 97) ———
// Flat, as pillar[5]arene: n α-D-glucopyranose rings round an n-gon, each a regular hexagon along a side with its C1
// and C4 at the two ends and the glycosidic O outside the corner between two rings. C2 and C3 (the secondary OH) point
// out; O5 and C5 point in, with C6 and its OH inside. Seen from the wide rim of the cone (the secondary OH), the narrow
// rim's CH2OH groups are the inner ring, as drawn. Each glucose reads as its Haworth projection seen from above (O5 at
// the back right, C1 at the right): C1–O hashed (α), C2–OH hashed, C3–OH wedged, C4–O hashed and C5–C6 wedged, every
// wedge's narrow end at its ring carbon. The build tries the 32 ways of putting a wedge or a hash on those five bonds
// (the same on every ring) and keeps the one whose InChI is the reference, so the drawing cannot be another isomer.
// The first atom is the top ring's O2, on the outside: a click on an atom puts the cyclodextrin there through C2 (a
// 2-O-substituted cyclodextrin when the atom is an O), the rest of it on the free side. (An O6, inside the ring, would
// put the top ring on the atoms behind the one clicked.)
// D: the n-gon's radius (to each ring's middle). w6: the way C5–C6 points, in the ring's own frame (300° straight out
// from the ring's middle), and turn: O6's turn from it. way: bit k set puts a wedge (else a hash) on bond k: 0 C1–O,
// 1 C2–O2, 2 C3–O3, 3 C4–O, 4 C5–C6.
export const HAWORTH = 0b10100;
function flatCyclodextrin(n, D, turn, way, w6 = 300) {
  const atoms = [], bonds = [], A = (label, p, first = false) => (atoms.push({ label, p, first }), atoms.length - 1);
  const B = (a, b, k) => bonds.push([a, b, k === undefined ? 0 : (way >> k) & 1 ? 1 : 6]);
  const units = [];
  for (let u = 0; u < n; u++) {
    // Round the n-gon anticlockwise from the top; x is mirrored below, so each ring goes O5, C1, C2, C3, C4, C5
    // clockwise as a Haworth projection seen from above does.
    const f = 90 * deg + (2 * Math.PI * u) / n, r = [Math.cos(f), Math.sin(f)], t = [-Math.sin(f), Math.cos(f)];
    const at = (w, from = [r[0] * D, r[1] * D]) => [from[0] + t[0] * Math.cos(w * deg) + r[0] * Math.sin(w * deg), from[1] + t[1] * Math.cos(w * deg) + r[1] * Math.sin(w * deg)];
    const p = { c1: at(180), c2: at(120), c3: at(60), c4: at(0), c5: at(300), o5: at(240) };
    p.o2 = at(120, p.c2); p.o3 = at(60, p.c3); p.c6 = at(w6, p.c5); p.o6 = at(w6 + turn, p.c6);
    const c1 = A("C", p.c1), c2 = A("C", p.c2), c3 = A("C", p.c3), c4 = A("C", p.c4), c5 = A("C", p.c5), o5 = A("O", p.o5);
    const o2 = A("O", p.o2, u === 0), o3 = A("O", p.o3), c6 = A("C", p.c6), o6 = A("O", p.o6);
    // C2–C3 first: the bond a click on a bond fuses (edit.ts addTemplate takes the first ring bond), which leaves no
    // wedge between two stereocentres.
    B(c2, c3); B(c1, c2); B(c3, c4); B(c4, c5); B(c5, o5); B(o5, c1);
    B(c2, o2, 1); B(c3, o3, 2); B(c5, c6, 4); B(c6, o6);
    units.push({ c1, c4 });
  }
  // The glycosidic O between ring u's C4 and ring u + 1's C1, out from the corner, one bond length from each.
  for (let u = 0; u < n; u++) {
    const a = units[u].c4, b = units[(u + 1) % n].c1, pa = atoms[a].p, pb = atoms[b].p;
    const mid = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2], l = Math.hypot(...mid), d = Math.hypot(pa[0] - pb[0], pa[1] - pb[1]) / 2, off = Math.sqrt(Math.max(0, 1 - d * d));
    const o = A("O", [mid[0] * (l + off) / l, mid[1] * (l + off) / l]);
    B(a, o, 3); B(b, o, 0);
  }
  // The top ring's O2 first; the x axis mirrored (the rings then run clockwise).
  const order = [atoms.findIndex((a) => a.first), ...atoms.map((_, i) => i).filter((i) => !atoms[i].first)], to = new Map(order.map((i, k) => [i, k]));
  const dr = new Drawing();
  for (const i of order) dr.atom(atoms[i].label, [-atoms[i].p[0], atoms[i].p[1], 0]);
  for (const [a, b, stereo] of bonds) dr.bond(to.get(a), to.get(b), 1, stereo ? { stereo } : {});
  return dr.done();
}
// The glycosidic C–O–C angle at the drawing's corners (degrees): ring 0's C4 is at r0·D + t0 and ring 1's C1 at
// r1·D − t1 (r and t each ring's outward and along directions), one bond length from the O.
const bridgeAngle = (n, D) => {
  const f = 90 * deg, g = 90 * deg + (2 * Math.PI) / n, c4 = [Math.cos(f) * D - Math.sin(f), Math.sin(f) * D + Math.cos(f)], c1 = [Math.cos(g) * D + Math.sin(g), Math.sin(g) * D - Math.cos(g)];
  return (2 * Math.asin(Math.min(1, Math.hypot(c4[0] - c1[0], c4[1] - c1[1]) / 2)) * 180) / Math.PI;
};
// α-, β- or γ-cyclodextrin (n = 6, 7, 8) as SMILES from first principles: OPSIN reads (read) the chain
// α-D-glucopyranosyl-(1→4)-…-α-D-glucopyranose of n units, and a ring bond from the first unit's O4 takes the place of
// the last unit's anomeric OH, written where the OH was, so every stereocentre's neighbours keep their order and its @
// or @@. Undefined if OPSIN's chain is not written as expected. src/hosts.check.ts compares it with PubChem's InChI.
export function cyclodextrinSmiles(n, read) {
  const chain = read(Array(n - 1).fill("alpha-D-glucopyranosyl-(1->4)-").join("") + "alpha-D-glucopyranose") ?? "";
  // The first unit is the chain's non-reducing end: C1, then C2, C3 and C4 with their OH, then C5 in the ring. The
  // last is the reducing end: its C1 with the anomeric OH, O5 and C5.
  const head = "[C@H]1([C@H](O)[C@@H](O)[C@H](O)", end = "[C@@H](O)O[C@@H]1CO)";
  if (!chain.startsWith(head) || chain.split(end).length !== 2) return undefined;
  return chain.replace(head, "[C@H]1([C@H](O)[C@@H](O)[C@H](O%99)").replace(end, "[C@@H]%99O[C@@H]1CO)");
}

// Cucurbit[n]uril written atom by atom: n glycolurils, each a C1H–C2H bond with an N–C(=O)–N urea ring on each side,
// joined to the next by a CH2 on each rim (the same urea ring of each). Its places are any, apart.
export function cucurbiturilGraph(n) {
  const atoms = [], bonds = [], A = (label) => (atoms.push({ label, location: [Math.cos(atoms.length), Math.sin(atoms.length) + atoms.length, 0] }), atoms.length - 1);
  const B = (a, b, type = 1) => bonds.push({ type, atoms: [a, b] }), units = [];
  for (let u = 0; u < n; u++) {
    const c1 = A("C"), c2 = A("C"), rims = [];
    for (let r = 0; r < 2; r++) {
      const na = A("N"), nb = A("N"), c = A("C");
      B(c1, na); B(c2, nb); B(na, c); B(nb, c); B(c, A("O"), 2);
      rims.push([na, nb]);
    }
    B(c1, c2);
    units.push(rims);
  }
  for (let u = 0; u < n; u++) for (const r of [0, 1]) { const c = A("C"); B(units[u][r][1], c); B(c, units[(u + 1) % n][r][0]); }
  return { atoms, bonds };
}

// The narrowest gap between two labels as Octet draws them (their ink boxes at the default style), in bond lengths.
export function labelGap(m) {
  const d = render(m, STYLE, arial, STYLE.bond), boxes = m.atoms.flatMap((a, i) => (d.label[i] ? [d.label[i]] : []));
  let gap = Infinity;
  boxes.forEach((p, i) => boxes.forEach((q, j) => {
    if (j > i) gap = Math.min(gap, Math.hypot(Math.max(0, q[0] - p[2], p[0] - q[2]), Math.max(0, q[1] - p[3], p[1] - q[3])));
  }));
  return gap / STYLE.bond;
}
// The nearest two labelled atoms that are not bonded, in bond lengths.
export function nearestLabelled(m) {
  const bonded = new Set(m.bonds.flatMap((b) => [`${b.atoms[0]} ${b.atoms[1]}`, `${b.atoms[1]} ${b.atoms[0]}`])), shown = m.atoms.flatMap((a, i) => (a.label !== "C" || a.text || a.shown ? [i] : []));
  let near = Infinity;
  for (const i of shown) for (const j of shown) if (j > i && !bonded.has(`${i} ${j}`)) near = Math.min(near, Math.hypot(m.atoms[i].location[0] - m.atoms[j].location[0], m.atoms[i].location[1] - m.atoms[j].location[1]));
  return near;
}
// The drawing of α- (n = 6), β- (7) or γ-cyclodextrin (8): the n-gon's size, the way each C6 leans and the turn of
// each O6 that keep the labels clear (clashes.mjs, as Octet draws them), every bond one bond length, not messy, no two
// O atoms that are not bonded nearer than one bond length, each glycosidic C–O–C angle 105° to 150°, and the labels as far apart as they go (to 0.05 bond length, then the angle
// nearest 120°); then the wedges pick(list) keeps. way: the wedges kept.
export function cyclodextrin(n, pick, clear, messy) {
  let best;
  for (let D = 3; D <= 6; D += 0.05) for (const w6 of [270, 285, 300, 315, 330]) for (const turn of [-75, -60, -45, 45, 60, 75]) {
    const angle = bridgeAngle(n, D);
    if (angle < 105 || angle > 150) continue;
    const m = flatCyclodextrin(n, D, turn, HAWORTH, w6);
    if (clear(m).length || messy(m) || nearestLabelled(m) < 1) continue;
    const near = labelGap(m), score = Math.round(near / 0.05) * 1000 - Math.abs(angle - 120);
    if (!best || score > best.score) best = { score, near, D, turn, w6, angle };
  }
  if (!best) return undefined;
  const ways = Array.from({ length: 32 }, (_, w) => flatCyclodextrin(n, best.D, best.turn, w, best.w6));
  const mol = pick(ways);
  return mol && { mol, way: ways.indexOf(mol), near: best.near, angle: best.angle, D: best.D, w6: best.w6, turn: best.turn };
}

// ——— Cucurbit[n]urils (issue 97) ———
// Flat, as the cage looks down its axis: n glycolurils round a circle, each drawn as chemists draw glycoluril (two
// five-membered urea rings sharing the CH–CH bond), that bond along the circle, one urea ring and its C=O outside and
// the other inside, and the CH2 bridges joining neighbours on both rims, bent out on the outer rim and in on the inner.
// The inner rim is drawn smaller, as the far portal looks from above: its rings, C=O and bridges at k bond lengths.
// No wedges: the methine CH pairs are all cis (every H out), and PubChem's standard InChI for CB[5] to CB[8] has no
// stereo layer. Units go round anticlockwise from the top; the first atom is the top unit's left methine carbon.
// R: the methines' radius; bo, so: the outer urea ring's bonds and how far its N atoms splay along the circle; k, si:
// the inner ring's.
export function flatCucurbituril(n, { R, bo, so, k, si }) {
  const ho = Math.sqrt(bo * bo - so * so), Ho = ho + Math.sqrt(bo * bo - (0.5 + so) ** 2), hi = Math.sqrt(k * k - si * si), Hi = hi + Math.sqrt(k * k - (0.5 + si) ** 2);
  const d = new Drawing(), rims = [];
  for (let u = 0; u < n; u++) {
    const f = 90 * deg + (2 * Math.PI * u) / n, r = [Math.cos(f), Math.sin(f)], t = [-Math.sin(f), Math.cos(f)];
    const at = (rad, along) => [r[0] * rad + t[0] * along, r[1] * rad + t[1] * along, 0];
    const c1 = d.atom("C", at(R, -0.5)), c2 = d.atom("C", at(R, 0.5));
    const ring = (sign, b, s, h, H, o) => {
      const na = d.atom("N", at(R + sign * h, -0.5 - s)), nb = d.atom("N", at(R + sign * h, 0.5 + s)), c = d.atom("C", at(R + sign * H, 0));
      d.bond(c1, na).bond(c2, nb).bond(na, c).bond(nb, c).bond(c, d.atom("O", at(R + sign * (H + o), 0)), 2);
      return [na, nb];
    };
    // The inner ring first, so the first bond (the one a click on a bond fuses) is a methine C to an inner N: the
    // fused drawing then has no warning.
    const inner = ring(-1, k, si, hi, Hi, k);
    rims.push([ring(1, bo, so, ho, Ho, 1), inner]);
    d.bond(c1, c2);
  }
  // Each bridge's CH2 out from the middle of the two N atoms (in, on the inner rim), its bonds as long as needed for an
  // angle of 150° at most, and no shorter than the rim's bonds.
  for (let u = 0; u < n; u++) for (const [side, sign, least] of [[0, 1, 1], [1, -1, k]]) {
    const a = rims[u][side][1], b = rims[(u + 1) % n][side][0], p = d.atoms[a].location, q = d.atoms[b].location;
    const mid = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], l = Math.hypot(mid[0], mid[1]), half = Math.hypot(p[0] - q[0], p[1] - q[1]) / 2;
    const bl = Math.max(least, half / Math.sin(75 * deg)), off = sign * Math.sqrt(bl * bl - half * half);
    const c = d.atom("C", [(mid[0] * (l + off)) / l, (mid[1] * (l + off)) / l, 0]);
    d.bond(a, c).bond(c, b);
  }
  return d.done();
}
// The angle at atom i between its bonds to a and b (degrees).
const angleAt = (m, i, a, b) => {
  const [p, u, v] = [i, a, b].map((j) => m.atoms[j].location), x = sub(u, p).slice(0, 2), y = sub(v, p).slice(0, 2);
  return Math.acos(Math.max(-1, Math.min(1, (x[0] * y[0] + x[1] * y[1]) / Math.hypot(...x) / Math.hypot(...y)))) / deg;
};
// The angles of the top unit's two urea rings (its atoms are 0 to 9: C, C, then N, N, C, O inside and outside) and
// of every bridge's CH2.
export function cucurbiturilAngles(m, n) {
  const rings = [[0, 2, 1], [1, 3, 0], [2, 0, 4], [3, 1, 4], [4, 2, 3], [0, 6, 1], [1, 7, 0], [6, 0, 8], [7, 1, 8], [8, 6, 7]].map(([i, a, b]) => angleAt(m, i, a, b));
  const bridges = Array.from({ length: 2 * n }, (_, j) => { const c = 10 * n + j, [a, b] = m.bonds.filter((x) => x.atoms.includes(c)).map((x) => x.atoms.find((y) => y !== c)); return angleAt(m, c, a, b); });
  return { rings, bridges };
}
// The drawing of cucurbit[n]uril: of a grid of sizes, the one that keeps every limit (labels clear as Octet draws them,
// not messy, every bond 0.75 to 1.28 bond lengths, each urea ring's angles within 25° of a regular pentagon's, no two
// labelled atoms that are not bonded nearer than one bond length) with the labels as far apart as they go (to 0.1 bond
// length), then the longest bond shortest. A size too small for the last limit (CB[5]: its five inner C=O meet in the
// middle) is drawn as well as the others allow, its outer rings flatter (bonds to 1.2, N atoms splayed to 0.6).
export function cucurbituril(n, clear, messy) {
  const lengths = (m) => m.bonds.map((b) => Math.hypot(m.atoms[b.atoms[0]].location[0] - m.atoms[b.atoms[1]].location[0], m.atoms[b.atoms[0]].location[1] - m.atoms[b.atoms[1]].location[1]));
  for (const spaced of [true, false]) {
    let best;
    for (let R = 2; R <= 6; R += 0.05) for (const bo of spaced ? [1, 1.1] : [1.1, 1.2]) for (const so of spaced ? [0.309, 0.4, 0.5] : [0.5, 0.6]) for (const k of [0.76, 0.8, 0.9, 1]) for (const si of [0.15, 0.2, 0.25, 0.3]) {
      if (k * k - (0.5 + si) ** 2 < 0.02) continue;
      const size = { R: +R.toFixed(2), bo, so, k, si }, m = flatCucurbituril(n, size), ls = lengths(m);
      if (Math.max(...ls) > 1.28 || Math.min(...ls) < 0.75 || (spaced && nearestLabelled(m) < 1)) continue;
      if (cucurbiturilAngles(m, n).rings.some((a) => Math.abs(a - 108) > 25)) continue;
      const score = Math.round(labelGap(m) / 0.1) * 100 - Math.max(...ls);
      if (best && score <= best.score) continue;
      if (messy(m) || clear(m).length) continue;
      best = { score, size, m };
    }
    if (best) return { mol: best.m, size: best.size, spaced };
  }
  return undefined;
}

const entry = (name, also, mol) => ({ name, ...(also ? { also } : {}), mol });
export const HOSTS = [
  entry("Calix[4]arene", "calixarene", flatCalixarene(false)),
  entry("p-tert-Butylcalix[4]arene", "calixarene", flatCalixarene(true)),
  entry("Pillar[5]arene", "pillararene, dimethoxypillar[5]arene", flatPillararene()),
  entry("[2.2]Paracyclophane", "cyclophane", paracyclophane().drawing()),
];
// The relaxed paracyclophane's shortest and longest bonds, for the build's check.
export const hostLengths = () => paracyclophane().lengths();
