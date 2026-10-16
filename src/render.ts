// ACS 1996 structure renderer: a KET molecule in, filled outlines and text runs out. Units are px.
// The geometry follows ChemDraw's ACS 1996 output, measured to about 1e-5 pt on a reference drawing:
// - Every bond line is a filled polygon. At an unlabelled atom the polygons meet in a mitred fan.
// - Bonds stop a margin short of the label's glyph outlines, with one cut per bond.
// - Ring double bonds keep the axis line and add an inner line, trimmed back to the ring-angle bisector.
// - Terminal double bonds (C=O) are centred and run on until they meet the neighbouring bonds.
// - Labels are anchored on the advance centre and half the ink height of their first glyph.

import { units } from "./labels.ts";

type P = [number, number];
// text: a label that is not one element (OMe, CO2Et, Ph). label then holds the element it attaches through.
export type Atom = { label: string; location: [number, number, number]; charge?: number; implicitHCount?: number; text?: string };
// KET stereo: 1 wedge, 6 hashed wedge. display: how a single bond is drawn when it is not plain.
export type Display = "bold" | "dashed" | "hashed" | "wavy" | "dative" | "hollow";
// position: where a double bond's second line goes, looking from atoms[0] to atoms[1]; unset means automatic.
export type Bond = { type: number; atoms: [number, number]; stereo?: number; display?: Display; position?: "left" | "centre" | "right" };
export type Mol = { atoms: Atom[]; bonds: Bond[] };
// Sizes in px: bond length, line width, bold width, double-bond spacing, hash spacing, label margin, label font size.
export type Style = { bond: number; line: number; bold: number; spacing: number; hash: number; margin: number; size: number };
// width: advance; ascent: ink top above the baseline; outline: glyph edge points relative to the text origin (y down).
export type Ink = { width: number; ascent: number; outline: P[] };
export type Label = { text: string; x: number; y: number; size: number };
export type Drawing = { polygons: P[][]; labels: Label[]; box: [number, number, number, number] };

const sub = (a: P, b: P): P => [a[0] - b[0], a[1] - b[1]];
const add = (a: P, b: P): P => [a[0] + b[0], a[1] + b[1]];
const mul = (a: P, k: number): P => [a[0] * k, a[1] * k];
const len = (a: P) => Math.hypot(a[0], a[1]);
const unit = (a: P): P => mul(a, 1 / len(a));
const perp = (a: P): P => [-a[1], a[0]];
const dot = (a: P, b: P) => a[0] * b[0] + a[1] * b[1];
const cross = (a: P, b: P) => a[0] * b[1] - a[1] * b[0];
const angle = (a: P, b: P) => Math.acos(Math.max(-1, Math.min(1, dot(a, b) / (len(a) * len(b)))));

// Label type: subscripts 75% and 0.212 em down, charges 75% and 0.33 em up.
const SUB = 0.75, DROP = 0.212, RISE = 0.33;
const TIP = 0.0165; // wedge half-width at the stereocentre, as a fraction of the bond length
const MAX_TRIM = 0.67; // an inner-line trim longer than this (times the bond length) is skipped
const H_FIRST = new Set(['O', 'F', 'S', 'Cl', 'Se', 'Br', 'Te', 'I']); // H2O, HCl; but NH3, CH4
const VALENCE: Record<string, number> = { C: 4, Si: 4, N: 3, P: 3, As: 3, B: 3, Al: 3, O: 2, S: 2, Se: 2, Te: 2, F: 1, Cl: 1, Br: 1, I: 1 };
const ORDER: Record<number, number> = { 1: 1, 2: 2, 3: 3, 4: 1.5 };

function hydrogens(label: string, charge: number, used: number) {
  const v = VALENCE[label];
  if (v === undefined) return 0;
  const target = v === 4 ? v - Math.abs(charge) : label === 'B' || label === 'Al' ? v - charge : v + charge;
  return Math.max(0, Math.round(target - used));
}

const segDist = (q: P, a: P, b: P) => {
  const ab = sub(b, a), t = Math.max(0, Math.min(1, dot(sub(q, a), ab) / (dot(ab, ab) || 1)));
  return len(sub(q, add(a, mul(ab, t))));
};

// Where line p + r·t meets line q + s·t; null if they are parallel.
const meet = (p: P, r: P, q: P, s: P): P | null => {
  const d = cross(r, s);
  return Math.abs(d) < 1e-9 ? null : add(p, mul(r, cross(sub(q, p), s) / d));
};

// Small rings through bond a–b (simple paths from a back to b, up to 8 atoms).
function ringsThrough(a: number, b: number, nbrs: number[][]): number[][] {
  const out: number[][] = [];
  const walk = (path: number[]) => {
    const at = path[path.length - 1];
    if (path.length > 8) return;
    for (const n of nbrs[at]) {
      if (n === b) out.push([...path, b]);
      else if (!path.includes(n)) walk([...path, n]);
    }
  };
  for (const n of nbrs[a]) if (n !== b) walk([a, n]);
  return out;
}

// A bond, planned. Kinds 'line' and 'wedge' join the fans; 'none' is a centred double bond (its two lines only).
// 'dash', 'hashbar' and 'wavy' are drawn along the axis and stay out of the fans. half: the line's half-width
// when it is not the normal one (bold). head: an arrowhead at b (dative bond).
// lines: extra lines parallel to the axis at offset o, trimmed t0 at a and t1 at b (negative runs past the atom).
// cut: distance from a and from b at which a label stops the bond.
type Plan = {
  a: number; b: number; u: P; n: P; length: number;
  kind: 'line' | 'wedge' | 'hash' | 'none' | 'dash' | 'hashbar' | 'wavy' | 'hollow';
  half?: number;
  head?: boolean;
  lines: { o: number; t0: number; t1: number }[];
  cut: [number, number];
  hidden?: boolean;
};

// scale: px per input unit. By default the median bond is drawn at the style's bond length.
export function render(mol: Mol, s: Style, measure: (text: string) => Ink, scale?: number): Drawing {
  const raw = mol.bonds.map((b) => len(sub(mol.atoms[b.atoms[0]].location as unknown as P, mol.atoms[b.atoms[1]].location as unknown as P)));
  const median = [...raw].sort((x, y) => x - y)[Math.floor(raw.length / 2)] || 1;
  const k = scale ?? s.bond / median;
  const pts: P[] = mol.atoms.map((a) => [a.location[0] * k, -a.location[1] * k]); // KET y points up
  const nbrs: number[][] = mol.atoms.map(() => []);
  mol.bonds.forEach((b) => { nbrs[b.atoms[0]].push(b.atoms[1]); nbrs[b.atoms[1]].push(b.atoms[0]); });
  const bondAt = new Map<string, Bond>();
  const key = (i: number, j: number) => (i < j ? `${i} ${j}` : `${j} ${i}`);
  mol.bonds.forEach((b) => bondAt.set(key(b.atoms[0], b.atoms[1]), b));
  const L = s.bond, hw = s.line / 2, wide = s.bold * 0.75, tip = TIP * L;
  const deg = (i: number) => nbrs[i].length;
  const dir = (i: number, j: number) => unit(sub(pts[j], pts[i]));

  // Labels. Heteroatoms and lone carbons get one; skeletal carbons don't, even when charged.
  const labelled = mol.atoms.map((a, i) => a.label !== 'C' || !deg(i) || !!a.text);
  const labels: Label[] = [];
  const sign = (c: number) => `${Math.abs(c) > 1 ? Math.abs(c) : ''}${c > 0 ? '+' : '–'}`;
  const shapes: P[][] = mol.atoms.map((a, i) => {
    if (!labelled[i]) {
      // A charged skeletal carbon: the sign alone, in the direction furthest from its bonds (up-right on a tie).
      if (a.charge) {
        const t = sign(a.charge), m = measure(t), dirs = nbrs[i].map((j) => dir(i, j));
        const gap = (c: P) => Math.min(...dirs.map((b) => angle(b, c)));
        const d = ([[1, -1], [-1, -1], [1, 1], [-1, 1], [0, -1], [1, 0], [0, 1], [-1, 0]] as P[]).map(unit).reduce((best, c) => (gap(c) > gap(best) + 0.01 ? c : best));
        const c = add(pts[i], mul(d, 0.6 * s.size));
        labels.push({ text: t, x: c[0] - (m.width * SUB) / 2, y: c[1] + (m.ascent * SUB) / 2, size: s.size * SUB });
      }
      return [];
    }
    const shape: P[] = [];
    const run = (text: string, x: number, y: number, f = 1) => {
      labels.push({ text, x, y, size: s.size * f });
      for (const [px, py] of measure(text).outline) shape.push([x + px * f, y + py * f]);
    };
    const [x, y] = pts[i];
    // Which way the label reads: away from the bonds. Bonds on the right (within 70° of horizontal) reverse it.
    const v = nbrs[i].reduce<P>((acc, j) => add(acc, dir(i, j)), [0, 0]);
    const steep = len(v) > 1e-6 && Math.abs(v[1]) > Math.abs(v[0]) * Math.tan((70 * Math.PI) / 180);
    if (a.text) {
      // A written label: units in order, reversed when it reads right to left (OMe as MeO). The attaching
      // unit's first glyph sits centred on the atom.
      const us = units(a.text), reversed = deg(i) > 0 && !steep && v[0] > 1e-6;
      const width = (u: (typeof us)[number]) => measure(u.text).width + (u.count ? measure(u.count).width * SUB : 0);
      const first = measure(us[0].text[0]), base = y + first.ascent / 2;
      const order = reversed ? [...us].reverse() : us;
      let cx = x - first.width / 2 - (reversed ? order.slice(0, -1).reduce((w, u) => w + width(u), 0) : 0);
      for (const u of order) {
        run(u.text, cx, base);
        if (u.count) run(u.count, cx + measure(u.text).width, base + DROP * s.size, SUB);
        cx += width(u);
      }
      const right = reversed ? x - first.width / 2 + width(us[0]) : cx;
      if (a.charge) run(sign(a.charge), right, base - RISE * s.size, SUB);
      return shape;
    }
    const first = measure(a.label[0]);
    const ox = x - first.width / 2, base = y + first.ascent / 2;
    run(a.label, ox, base);
    const charge = a.charge ?? 0;
    const used = nbrs[i].reduce((n, j) => n + (ORDER[bondAt.get(key(i, j))!.type] ?? 1), 0);
    const h = a.implicitHCount ?? hydrogens(a.label, charge, used);
    const count = h > 1 ? String(h) : '';
    const hW = measure('H').width, cW = count ? measure(count).width * SUB : 0;
    const hs = (hx: number, hy: number) => { run('H', hx, hy); if (count) run(count, hx + hW, hy + DROP * s.size, SUB); };
    let end = ox + measure(a.label).width; // the charge goes here
    if (h) {
      // Sum of the bond directions: within 70° of horizontal, H goes on the far side; steeper, H stacks (indole NH).
      if (deg(i) ? !steep && v[0] > 1e-6 : H_FIRST.has(a.label)) hs(ox - hW - cW, base); // HO, H2N
      else if (!steep || deg(i) < 2) { hs(end, base); end += hW + cW; } // OH, NH2
      else { const pitch = 1.1 * measure('H').ascent; hs(x - hW / 2, base + (v[1] > 0 ? -pitch : pitch)); }
    }
    if (charge) run(sign(charge), end, base - RISE * s.size, SUB);
    return shape;
  });

  const plans: Plan[] = mol.bonds.map((bond) => {
    const [a, b] = bond.atoms, p = pts[a], q = pts[b];
    const length = len(sub(q, p)), u = unit(sub(q, p)), n = perp(u);
    const plan: Plan = { a, b, u, n, length, kind: 'line', lines: [], cut: [0, 0] };
    const side = (j: number) => Math.sign(dot(sub(pts[j], p), n));
    // Angles at x from the bond to x's other neighbours on one side, smallest first.
    const near = (x: number, y: number, sd: number) =>
      nbrs[x].filter((j) => j !== y && side(j) === sd).map((j) => angle(sub(pts[y], pts[x]), sub(pts[j], pts[x]))).sort((m, l) => m - l);

    if (bond.type === 1 && (bond.stereo === 1 || bond.stereo === 6)) { plan.kind = bond.stereo === 1 ? 'wedge' : 'hash'; return plan; }
    if (bond.type === 1 && bond.display) {
      if (bond.display === 'bold') plan.half = s.bold / 2;
      else if (bond.display === 'dative') plan.head = true;
      else plan.kind = bond.display === 'dashed' ? 'dash' : bond.display === 'hashed' ? 'hashbar' : bond.display === 'hollow' ? 'hollow' : 'wavy';
      return plan;
    }
    if (bond.type === 3) { plan.lines = [s.spacing, -s.spacing].map((o) => ({ o, t0: 0, t1: 0 })); return plan; }
    if (bond.type !== 2) return plan;

    // Side of the second line: into the ring with the most double bonds (then six-membered, then smallest),
    // toward the inside of the angle at an unlabelled degree-2 end, or toward more substituents. 0 = centred.
    let sd = 0, ring: number[] | undefined;
    const rings = ringsThrough(a, b, nbrs);
    // A position the user set wins. On screen (y down) the left of a→b is the -n side.
    if (bond.position) sd = bond.position === "centre" ? 0 : bond.position === "left" ? -1 : 1;
    else if (rings.length) {
      const doubles = (r: number[]) => r.reduce((c, at, i) => c + (i && bondAt.get(key(r[i - 1], at))?.type === 2 ? 1 : 0), 0);
      ring = rings.sort((x, y) => doubles(y) - doubles(x) || Number(y.length === 6) - Number(x.length === 6) || x.length - y.length)[0];
      const centre = mul(ring.reduce<P>((c, i) => add(c, pts[i]), [0, 0]), 1 / ring.length);
      sd = Math.sign(dot(sub(centre, p), n));
    } else if (deg(a) === 1 || deg(b) === 1) {
      const inner = deg(a) === 1 ? b : a, outer = inner === a ? b : a;
      if (deg(inner) === 2 && !labelled[inner]) sd = side(nbrs[inner].find((j) => j !== outer)!);
    } else {
      const linear = (x: number, y: number) =>
        deg(x) === 2 && nbrs[x].every((j) => bondAt.get(key(x, j))!.type === 2) &&
        angle(sub(pts[y], pts[x]), sub(pts[nbrs[x].find((j) => j !== y)!], pts[x])) > (161.8 * Math.PI) / 180;
      if (!(labelled[a] && labelled[b]) && !linear(a, b) && !linear(b, a)) {
        const others = [...nbrs[a].filter((j) => j !== b), ...nbrs[b].filter((j) => j !== a)];
        sd = Math.sign(others.reduce((c, j) => c + side(j), 0)) || side(nbrs[a].find((j) => j !== b)!);
      }
    }

    if (!sd) {
      // Centred: lines at ±spacing/2 that stay out of the fan and run on to the neighbouring bond's axis.
      plan.kind = 'none';
      const h = s.spacing / 2;
      const reach = (x: number, y: number, o: number) => {
        const phi = labelled[x] ? undefined : near(x, y, Math.sign(o))[0];
        return phi === undefined ? 0 : h / Math.tan(phi);
      };
      plan.lines = [h, -h].map((o) => ({ o, t0: reach(a, b, o), t1: reach(b, a, o) }));
      return plan;
    }
    // Offset: the axis joins the fan; the inner line is trimmed back to the angle bisector at unlabelled ends.
    const trim = (x: number, y: number, ringNbr?: number) => {
      if (labelled[x]) return 0;
      const theta = ringNbr !== undefined ? angle(sub(pts[y], pts[x]), sub(pts[ringNbr], pts[x])) : near(x, y, sd)[0];
      if (theta === undefined) return 0;
      const t = s.spacing / Math.tan(theta / 2);
      return t > MAX_TRIM * L ? 0 : t;
    };
    plan.lines = [{ o: sd * s.spacing, t0: trim(a, b, ring?.[1]), t1: trim(b, a, ring?.[ring.length - 2]) }];
    return plan;
  });

  // Label cuts: the shortest cut along the axis at which every line of the bond clears the glyph outlines.
  // Provisional sizes for the bond styles ChemDraw's reference drawing did not include.
  const WAVE = 0.08 * L; // wavy bond amplitude
  const half = (pl: Plan) => pl.half ?? (pl.kind === 'hashbar' ? s.bold / 2 : pl.kind === 'wavy' ? WAVE + hw : hw);
  const widths = (pl: Plan, x: number): [number, number] =>
    pl.kind === 'wedge' || pl.kind === 'hash' || pl.kind === 'hollow' ? (x === pl.a ? [tip, wide] : [wide, tip]) : [half(pl), half(pl)];
  for (const pl of plans) {
    for (const end of [0, 1] as const) {
      const x = end ? pl.b : pl.a, shape = shapes[x];
      if (!shape.length) continue;
      const u = end ? mul(pl.u, -1) : pl.u, w = widths(pl, x)[0];
      const offsets = [...(pl.kind === 'none' ? [] : [0]), ...pl.lines.map((l) => l.o)];
      const clear = (t: number) => offsets.every((o) => {
        const from = add(add(pts[x], mul(u, t)), mul(pl.n, o)), to = add(add(pts[x], mul(u, pl.length)), mul(pl.n, o));
        return shape.every((q) => segDist(q, from, to) >= s.margin + w);
      });
      if (clear(0)) continue;
      if (!clear(pl.length)) { pl.hidden = true; break; }
      let lo = 0, hi = pl.length;
      for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2; if (clear(mid)) hi = mid; else lo = mid; }
      pl.cut[end] = hi;
    }
  }

  // Mitred fans at unlabelled atoms. Each end is a list of points from the -n to the +n side of the
  // bond as seen from that atom; with two or more members it passes through the atom centre.
  const drawnEnd = (pl: Plan, x: number): P => (x === pl.a ? add(pts[pl.a], mul(pl.u, pl.cut[0])) : add(pts[pl.b], mul(pl.u, -pl.cut[1])));
  const ends = new Map<string, P[]>();
  mol.atoms.forEach((_, x) => {
    if (labelled[x]) return;
    const X = pts[x];
    const members = plans
      .map((pl, i) => ({ pl, i }))
      .filter(({ pl }) => !pl.hidden && (pl.kind === 'line' || pl.kind === 'wedge') && (pl.a === x || pl.b === x))
      .map(({ pl, i }) => {
        const f = drawnEnd(pl, x === pl.a ? pl.b : pl.a), u = unit(sub(f, X)), [w0, w1] = widths(pl, x);
        return { i, u, n: perp(u), w0, w1, f, ang: Math.atan2(u[1], u[0]) };
      })
      .sort((m, l) => m.ang - l.ang);
    type M = (typeof members)[number];
    // Where m's +n edge meets l's -n edge. Parallel, or too far out (very acute angles): square corners instead.
    const miter = (m: M, l: M): [P, P] => {
      const pm = add(X, mul(m.n, m.w0)), pl = add(X, mul(l.n, -l.w0));
      const c = meet(pm, sub(add(m.f, mul(m.n, m.w1)), pm), pl, sub(add(l.f, mul(l.n, -l.w1)), pl));
      return c && len(sub(c, X)) < 6 * Math.max(m.w0, l.w0, hw) ? [c, c] : [pm, pl];
    };
    members.forEach((m, j) => {
      if (members.length === 1) { ends.set(`${m.i} ${x}`, [add(X, mul(m.n, -m.w0)), add(X, mul(m.n, m.w0))]); return; }
      const prev = members[(j + members.length - 1) % members.length], next = members[(j + 1) % members.length];
      ends.set(`${m.i} ${x}`, [miter(prev, m)[1], X, miter(m, next)[0]]);
    });
  });
  // An end with no fan (at a labelled atom): square, at the label cut.
  const endOf = (pl: Plan, i: number, x: number): P[] => {
    const fan = ends.get(`${i} ${x}`);
    if (fan) return fan;
    const n = x === pl.a ? pl.n : mul(pl.n, -1), c = drawnEnd(pl, x), w = widths(pl, x)[0];
    return [add(c, mul(n, -w)), add(c, mul(n, w))];
  };

  // Every polygon winds the same way (-n to +n at its start, then back along +n), so one nonzero path fills them all.
  const polygons: P[][] = [];
  const bar = (S: P, E: P, n: P, w: number) => polygons.push([add(S, mul(n, -w)), add(S, mul(n, w)), add(E, mul(n, w)), add(E, mul(n, -w))]);
  plans.forEach((pl, i) => {
    if (pl.hidden) return;
    if (pl.kind === 'line' || pl.kind === 'wedge') polygons.push([...endOf(pl, i, pl.a), ...endOf(pl, i, pl.b)]);
    const S = drawnEnd(pl, pl.a), D = pl.length - pl.cut[0] - pl.cut[1];
    if (pl.kind === 'dash') {
      // Evenly spaced dashes, one per hash spacing, the first and last flush with the ends.
      const count = Math.max(1, Math.round(D / s.hash)), dash = Math.min(D, s.hash * 0.55), step = count > 1 ? (D - dash) / (count - 1) : 0;
      for (let k = 0; k < count; k++) bar(add(S, mul(pl.u, k * step)), add(S, mul(pl.u, k * step + dash)), pl.n, hw);
    }
    if (pl.kind === 'hashbar') {
      // Marks of one length (the bold width), evenly spaced from end to end.
      const marks = Math.max(1, Math.round(D / s.hash));
      for (let j = 0; j <= marks; j++) {
        const c = add(S, mul(pl.u, hw + ((D - 2 * hw) * j) / marks));
        bar(add(c, mul(pl.u, -hw)), add(c, mul(pl.u, hw)), pl.n, s.bold / 2);
      }
    }
    if (pl.kind === 'wavy') {
      // A sine wave with a whole number of waves, as one strip of even width.
      const waves = Math.max(1, Math.round(D / (0.25 * L))), k = (2 * Math.PI * waves) / D, steps = waves * 16;
      const left: P[] = [], right: P[] = [];
      for (let j = 0; j <= steps; j++) {
        const t = (D * j) / steps, c = add(add(S, mul(pl.u, t)), mul(pl.n, WAVE * Math.sin(k * t)));
        const normal = perp(unit(add(pl.u, mul(pl.n, WAVE * k * Math.cos(k * t)))));
        left.push(add(c, mul(normal, hw)));
        right.push(add(c, mul(normal, -hw)));
      }
      polygons.push([right[0], ...left, ...right.slice(1).reverse()]);
    }
    if (pl.kind === 'hollow') {
      // Hollow wedge: the wedge's outline, in normal-width lines, point at a.
      const E = drawnEnd(pl, pl.b), left = add(E, mul(pl.n, wide - hw)), right = add(E, mul(pl.n, -(wide - hw)));
      for (const corner of [left, right]) {
        const u = unit(sub(corner, S));
        bar(S, corner, perp(u), hw);
      }
      bar(add(right, mul(pl.n, -hw)), add(left, mul(pl.n, hw)), mul(pl.u, -1), hw);
    }
    if (pl.head) {
      // Dative bond: an arrowhead pointing at b.
      const E = drawnEnd(pl, pl.b), base = add(E, mul(pl.u, -0.3 * L)), w = 0.12 * L;
      polygons.push([add(base, mul(pl.n, -w)), add(base, mul(pl.n, w)), E]);
    }
    if (pl.kind === 'hash') {
      // round(length / hash spacing) marks at even pitch, the last one flush with the wide end.
      const start = drawnEnd(pl, pl.a), D = pl.length - pl.cut[0] - pl.cut[1], marks = Math.max(1, Math.round(D / s.hash)), pitch = D / marks;
      for (let j = 1; j <= marks; j++) {
        const t = j * pitch - hw, c = add(start, mul(pl.u, t));
        bar(add(c, mul(pl.u, -hw)), add(c, mul(pl.u, hw)), pl.n, tip + ((wide - tip) * t) / D);
      }
    }
    for (const { o, t0, t1 } of pl.lines) {
      const from = labelled[pl.a] ? pl.cut[0] : t0, to = pl.length - (labelled[pl.b] ? pl.cut[1] : t1);
      if (to - from < 0.1) continue;
      bar(add(add(pts[pl.a], mul(pl.u, from)), mul(pl.n, o)), add(add(pts[pl.a], mul(pl.u, to)), mul(pl.n, o)), pl.n, hw);
    }
  });

  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of [...pts, ...polygons.flat(), ...shapes.flat()]) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const pad = L / 2;
  return { polygons, labels, box: [x0 - pad, y0 - pad, x1 + pad, y1 + pad] };
}
