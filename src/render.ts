// ACS 1996 molecule renderer: a KET molecule in, SVG primitives out. Units are px (1 pt = 4/3 px).
// Rules: ring double bonds keep one line on the bond and put a shorter inner line inside the ring;
// terminal double bonds (C=O) are centred; bonds stop a margin short of label ink; corners are mitred.
// Heteroatoms get their implicit H on the side away from their bonds; subscripts follow ChemDraw's ACS output
// (75% size, baseline 0.21 em lower). Charges sit after a right-hand H, otherwise in the first free corner.

export type Atom = { label: string; location: [number, number, number]; charge?: number; implicitHCount?: number };
export type Bond = { type: number; atoms: [number, number]; stereo?: number }; // KET stereo: 1 wedge, 6 hash
export type Mol = { atoms: Atom[]; bonds: Bond[] };
export type Style = { bond: number; spacing: number; margin: number; bold: number; hash: number; size: number };
export type Ink = { left: number; right: number; ascent: number; descent: number; width: number };
type P = [number, number];
type Rect = [number, number, number, number]; // x0, y0, x1, y1
export type Drawing = {
  paths: string[];
  lines: [P, P][];
  wedges: P[][];
  labels: { text: string; x: number; y: number; size: number }[];
  box: Rect;
};

const sub = (a: P, b: P): P => [a[0] - b[0], a[1] - b[1]];
const add = (a: P, b: P): P => [a[0] + b[0], a[1] + b[1]];
const mul = (a: P, k: number): P => [a[0] * k, a[1] * k];
const len = (a: P) => Math.hypot(a[0], a[1]);
const unit = (a: P): P => mul(a, 1 / len(a));
const dot = (a: P, b: P) => a[0] * b[0] + a[1] * b[1];
const cross = (a: P, b: P) => a[0] * b[1] - a[1] * b[0];
const SUB = 0.75, DROP = 0.21, RISE = 0.4;
const VALENCE: Record<string, number> = { C: 4, N: 3, P: 3, O: 2, S: 2, Se: 2, B: 3, F: 1, Cl: 1, Br: 1, I: 1 };
const angle = (a: P, b: P) => Math.acos(Math.max(-1, Math.min(1, (a[0] * b[0] + a[1] * b[1]) / (len(a) * len(b)))));

// Trims the parts of segment pq that lie inside rect r (Liang–Barsky). Returns null if it is all inside.
function clip(p: P, q: P, r: Rect): [P, P] | null {
  const d = sub(q, p);
  let t0 = 0, t1 = 1;
  for (const [num, den] of [[p[0] - r[0], -d[0]], [r[2] - p[0], d[0]], [p[1] - r[1], -d[1]], [r[3] - p[1], d[1]]]) {
    if (den === 0) { if (num < 0) return [p, q]; continue; }
    const t = num / den;
    if (den < 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t);
  }
  if (t0 > t1) return [p, q]; // the segment misses the rect
  if (t0 <= 0 && t1 >= 1) return null;
  if (t0 <= 0) return [add(p, mul(d, t1)), q];
  if (t1 >= 1) return [p, add(p, mul(d, t0))];
  return [p, q]; // passes through the middle: leave it
}

const clipAll = (p: P, q: P, rects: Rect[]) => rects.reduce<[P, P] | null>((seg, r) => seg && clip(seg[0], seg[1], r), [p, q]);

// Small rings through bond a–b (simple paths from a back to b, up to 8 atoms).
function ringsThrough(a: number, b: number, nbrs: number[][]): number[][] {
  const out: number[][] = [];
  const walk = (path: number[]) => {
    const at = path[path.length - 1];
    if (path.length > 8) return;
    for (const n of nbrs[at]) {
      if (n === b) out.push([...path, b]);
      else if (n !== b && !path.includes(n)) walk([...path, n]);
    }
  };
  for (const n of nbrs[a]) if (n !== b) walk([a, n]);
  return out;
}

export function render(mol: Mol, s: Style, measure: (text: string) => Ink): Drawing {
  const raw = mol.bonds.map((b) => len(sub(mol.atoms[b.atoms[0]].location as unknown as P, mol.atoms[b.atoms[1]].location as unknown as P)));
  const median = [...raw].sort((x, y) => x - y)[Math.floor(raw.length / 2)] || 1;
  const k = s.bond / median;
  const pts: P[] = mol.atoms.map((a) => [a.location[0] * k, -a.location[1] * k]); // KET y points up
  const nbrs: number[][] = mol.atoms.map(() => []);
  mol.bonds.forEach((b) => { nbrs[b.atoms[0]].push(b.atoms[1]); nbrs[b.atoms[1]].push(b.atoms[0]); });

  // Labels: centre the ink of the element symbol on the atom; each run's bond-stop box is its ink plus the margin.
  const labels: Drawing['labels'] = [];
  const order = (b: Bond) => (b.type === 4 ? 1.5 : b.type);
  const labelled = mol.atoms.map((a, i) => a.label !== 'C' || !nbrs[i].length);
  const boxes: Rect[][] = mol.atoms.map((a, i) => {
    const rects: Rect[] = [];
    const run = (text: string, x: number, y: number, k = 1, clips = true) => {
      const m = measure(text);
      labels.push({ text, x, y, size: s.size * k });
      if (clips) rects.push([x - m.left * k - s.margin, y - m.ascent * k - s.margin, x + m.right * k + s.margin, y + m.descent * k + s.margin]);
      return m.width * k;
    };
    const [x, y] = pts[i];
    const dirs = nbrs[i].map((j) => unit(sub(pts[j], pts[i])));
    const charge = a.charge ?? 0;
    const sign = charge ? (Math.abs(charge) > 1 ? Math.abs(charge) : '') + (charge > 0 ? '+' : '\u2212') : '';
    // Charge in the direction furthest from every bond; ties go to the earlier direction (up-right first).
    // Charges sit in free space, so they don't trim bonds.
    const corner = (r: number) => {
      const gap = (c: P) => Math.min(...dirs.map((b) => Math.acos(Math.min(1, dot(b, c)))));
      const d = ([[1, -1], [-1, -1], [1, 1], [-1, 1], [0, -1], [1, 0], [0, 1], [-1, 0]] as P[]).map(unit).reduce((best, c) => (gap(c) > gap(best) + 0.01 ? c : best));
      const m = measure(sign), c = add(pts[i], mul(d, r));
      run(sign, c[0] + ((m.left - m.right) / 2) * SUB, c[1] + ((m.ascent - m.descent) / 2) * SUB, SUB, false);
    };
    if (!labelled[i]) { if (sign) corner(0.6 * s.size); return rects; }
    const m = measure(a.label);
    const ox = x + (m.left - m.right) / 2, base = y + (m.ascent - m.descent) / 2;
    run(a.label, ox, base);
    const used = mol.bonds.reduce((n, b) => n + (b.atoms.includes(i) ? order(b) : 0), 0);
    const h = a.implicitHCount ?? Math.max(0, (VALENCE[a.label] ?? 0) + charge - used);
    // H goes right, else left, else below, else above: the first side no bond points to.
    const sub2 = h > 1 ? String(h) : '';
    const hw = measure('H').width + (sub2 ? measure(sub2).width * SUB : 0);
    const hydrogens = (hx: number, hy: number) => { const w = run('H', hx, hy); if (sub2) run(sub2, hx + w, hy + DROP * s.size, SUB); };
    const right = !dirs.some((d) => d[0] > 0.1);
    if (h && right) hydrogens(ox + m.width, base);
    else if (h && !dirs.some((d) => d[0] < -0.1)) hydrogens(ox - hw, base);
    else if (h) hydrogens(x - measure('H').width / 2, base + (dirs.some((d) => d[1] > 0.1) ? -s.size : s.size));
    if (sign && h && right) run(sign, ox + m.width + hw, base - RISE * s.size, SUB, false);
    else if (sign) corner(0.7 * s.size);
    return rects;
  });

  const axis: { a: number; b: number; p: P; q: P }[] = [];
  const lines: [P, P][] = [];
  const wedges: P[][] = [];
  const pushLine = (p: P, q: P, a: number, b: number) => {
    const c = clipAll(p, q, [...boxes[a], ...boxes[b]]);
    if (c) lines.push(c);
  };

  for (const bond of mol.bonds) {
    const [a, b] = bond.atoms;
    const p = pts[a], q = pts[b];
    const n = unit([p[1] - q[1], q[0] - p[0]]); // left normal of a→b
    const centred = (offsets: number[]) => offsets.forEach((o) => pushLine(add(p, mul(n, o)), add(q, mul(n, o)), a, b));
    if (bond.type === 3) { centred([-s.spacing, 0, s.spacing]); continue; }
    if (bond.type === 1 && (bond.stereo === 1 || bond.stereo === 6)) {
      // Wedge (solid) or hash: narrow at the stereocentre (a), bold width at b.
      const c = clipAll(p, q, boxes[b]) ?? [p, q], end = c[1], half = mul(n, s.bold / 2);
      if (bond.stereo === 1) wedges.push([p, add(end, half), sub(end, half)]);
      else {
        const L = len(sub(end, p)), steps = Math.max(2, Math.floor(L / s.hash));
        for (let i = 1; i <= steps; i++) {
          const t = i / steps, c0 = add(p, mul(sub(end, p), t)), w = mul(half, t);
          lines.push([add(c0, w), sub(c0, w)]);
        }
      }
      continue;
    }
    if (bond.type !== 2) { axis.push({ a, b, p, q }); continue; }

    // Double bond: inside a ring, or toward the side with more substituents; centred if either end is terminal.
    // Each ring is a path [a, …, b]; prefer six-membered rings, then the smallest.
    const ring = ringsThrough(a, b, nbrs).sort((x, y) => Number(y.length === 6) - Number(x.length === 6) || x.length - y.length)[0];
    let side = 0, na: number | undefined, nb: number | undefined;
    if (ring) {
      const c = mul(ring.reduce((acc, i) => add(acc, pts[i]), [0, 0] as P), 1 / ring.length);
      side = Math.sign(cross(sub(q, p), sub(c, p)));
      na = ring[1];
      nb = ring[ring.length - 2];
    } else if (nbrs[a].length > 1 && nbrs[b].length > 1) {
      const count = (i: number, other: number) => nbrs[i].filter((j) => j !== other).map((j) => Math.sign(cross(sub(q, p), sub(pts[j], p))));
      const votes = [...count(a, b), ...count(b, a)].reduce((x, y) => x + y, 0);
      side = Math.sign(votes);
      na = nbrs[a].find((j) => j !== b && Math.sign(cross(sub(q, p), sub(pts[j], p))) === side);
      nb = nbrs[b].find((j) => j !== a && Math.sign(cross(sub(q, p), sub(pts[j], p))) === side);
    }
    if (!side) { centred([-s.spacing / 2, s.spacing / 2]); continue; }
    axis.push({ a, b, p, q });
    // Inner line: offset toward the ring/substituents, shortened where it meets the neighbouring bonds.
    const trim = (at: number, other: number, nb?: number) =>
      labelled[at] || nb === undefined ? 0 : s.spacing / Math.tan(angle(sub(pts[other], pts[at]), sub(pts[nb], pts[at])) / 2);
    const u = unit(sub(q, p)), off = mul(n, side * s.spacing);
    pushLine(add(add(p, off), mul(u, trim(a, b, na))), add(add(q, off), mul(u, -trim(b, a, nb))), a, b);
  }

  // Join axis lines that meet at unlabelled atoms into paths, so ring and chain corners get mitred joins.
  const clipped = axis.map(({ a, b, p, q }) => clipAll(p, q, [...boxes[a], ...boxes[b]]));
  const used = new Set<number>();
  const at = (atom: number) => axis.map((_, i) => i).filter((i) => !used.has(i) && clipped[i] && !labelled[atom] && (axis[i].a === atom || axis[i].b === atom));
  const paths: string[] = [];
  axis.forEach((_, start) => {
    if (used.has(start) || !clipped[start]) return;
    used.add(start);
    const chain: P[] = [...clipped[start]!];
    const atoms = [axis[start].a, axis[start].b];
    for (const forward of [true, false]) {
      for (;;) {
        const end = forward ? atoms[atoms.length - 1] : atoms[0];
        const next = at(end)[0];
        if (next === undefined) break;
        used.add(next);
        const e = axis[next], far = e.a === end ? e.b : e.a;
        const [p, q] = clipped[next]!;
        const farPoint = e.a === end ? q : p;
        if (forward) { chain.push(farPoint); atoms.push(far); } else { chain.unshift(farPoint); atoms.unshift(far); }
      }
    }
    const closed = atoms.length > 2 && atoms[0] === atoms[atoms.length - 1];
    const d = (closed ? chain.slice(0, -1) : chain).map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`).join('');
    paths.push(closed ? d + 'Z' : d);
  });

  const xs = [...pts.map((p) => p[0]), ...boxes.flat().flatMap((r) => [r[0], r[2]])];
  const ys = [...pts.map((p) => p[1]), ...boxes.flat().flatMap((r) => [r[1], r[3]])];
  const pad = s.bond / 2;
  return { paths, lines, wedges, labels, box: [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) + pad, Math.max(...ys) + pad] };
}
