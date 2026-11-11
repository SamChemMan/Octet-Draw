// The facts of the overlay that shows while an AI app works (McpMagic.tsx), kept apart from it so a check can read
// them (motion.check.ts): how long it stays, the molecules it builds, and when each part of one is drawn.

// The overlay stays this long (ms) after an AI app's last call that changes the drawing. An AI app thinks between
// calls, often for some seconds, so a run of calls reads as one piece of work.
export const LINGER = 8000;
// The window stays soft this long (ms) after a call: calls that come close together read as one, and the fade in
// always ends before the fade out starts. Then the drawing is clear again, but for the molecule.
export const HOLD = 1000;

// A molecule to build: its atoms in bond lengths (y down), and its bonds in the order they are drawn. A bond to an
// atom that is not there yet brings the atom; one to an atom that is there closes a ring. 1 or -1 makes a double bond,
// its second line on the right (1) or the left (-1) of from → to. A double bond to an end atom (a C=O) is centred.
export type Sketch = { atoms: [number, number][]; bonds: [from: number, to: number, double?: 1 | -1][] };

// A regular ring with bonds of length 1, its first atom at the top (turned by `turn`), and its bonds with every second
// one double, the second line inside.
const ring = (n: number, turn = 0): [number, number][] => Array.from({ length: n }, (_, k) => {
  const a = turn + (k / n) * 2 * Math.PI - Math.PI / 2, r = 0.5 / Math.sin(Math.PI / n);
  return [r * Math.cos(a), r * Math.sin(a)];
});
const around = (n: number): Sketch["bonds"] => Array.from({ length: n }, (_, k) => (k % 2 ? [k, (k + 1) % n] : [k, (k + 1) % n, 1]));

// Benzene, caffeine, cyclooctatetraene (the octagon of Octet's mark, as benzene is its hexagon) and aspirin.
export const SKETCHES: Sketch[] = [
  { atoms: ring(6), bonds: around(6) },
  {
    atoms: [[0, -1], [-0.866, -0.5], [-0.866, 0.5], [0, 1], [0.866, 0.5], [0.866, -0.5], [1.817, -0.809], [2.405, 0], [1.817, 0.809], [0, -2], [-1.732, -1], [-1.732, 1], [0, 2], [2.126, -1.76]],
    bonds: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5, -1], [5, 0], [5, 6], [6, 7], [7, 8, 1], [8, 4], [0, 9, 1], [1, 10], [2, 11, 1], [3, 12], [6, 13]],
  },
  { atoms: ring(8, Math.PI / 8), bonds: around(8) },
  {
    atoms: [...ring(6), [0, -2], [-0.866, -2.5], [0.866, -2.5], [1.732, -1], [2.598, -0.5], [2.598, 0.5], [3.464, -1]],
    bonds: [...around(6), [0, 6], [6, 7, 1], [6, 8], [1, 9], [9, 10], [10, 11, 1], [10, 12]],
  },
];

// A bond's length in the overlay (px; the molecule's ground is 200 across).
export const BOND = 30;
// Times are in steps of --motion (180 ms). LEAD: the wait before the first atom, while the loop that shows the
// molecule (mcp-life, editor.css) is still clear. BUILD: the most steps a molecule takes, so a large one is built
// in smaller steps and none takes much over 2 s.
export const LEAD = 2, BUILD = 10;

// A sketch as McpMagic draws it, about its middle (px): a line for each bond, from its first atom, with its turn
// (degrees) and length, then the second line of each double bond (shorter, and to one side by the page's own bond
// spacing, 18%), and a dot for each atom. A double bond to an atom with no other bond is drawn as the page draws it
// (render.ts): two whole lines, half the spacing each side of the atoms. `at`: the step its motion starts. An atom
// pops as the bond to it arrives; the second lines come last, one after another. `end`: the step the last motion
// starts.
export function parts(s: Sketch) {
  const xs = s.atoms.map((p) => p[0]), ys = s.atoms.map((p) => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const dots = s.atoms.map((p) => ({ x: (p[0] - cx) * BOND, y: (p[1] - cy) * BOND, at: 0 }));
  const pops = new Map([[s.bonds[0][0], 0]]);
  s.bonds.forEach(([, to], k) => { if (!pops.has(to)) pops.set(to, k + 1); });
  const doubles = s.bonds.flatMap(([from, to, side], k) => (side ? [{ from, to, side, k }] : []));
  const last = s.bonds.length + doubles.length / 2, pace = Math.min(1, BUILD / last), at = (t: number) => LEAD + t * pace;
  for (const [i, d] of dots.entries()) d.at = at(pops.get(i)!);
  const bondsAt = s.atoms.map((_, i) => s.bonds.filter(([from, to]) => from === i || to === i).length), centred = (from: number, to: number) => bondsAt[from] === 1 || bondsAt[to] === 1;
  // off: where the line is, in bond spacings to the right of from → to. inset: what is cut from each end (px).
  const line = (from: number, to: number, when: number, off = 0, inset = 0) => {
    const a = dots[from], b = dots[to], length = Math.hypot(b.x - a.x, b.y - a.y), ux = (b.x - a.x) / length, uy = (b.y - a.y) / length, gap = off * 0.18 * BOND;
    return { x: a.x + ux * inset - uy * gap, y: a.y + uy * inset + ux * gap, turn: (Math.atan2(uy, ux) * 180) / Math.PI, length: length - 2 * inset, at: at(when) };
  };
  return {
    lines: [
      ...s.bonds.map(([from, to, side], k) => line(from, to, k + 0.4, side && centred(from, to) ? -0.5 : 0)),
      ...doubles.map((d, n) => { const c = centred(d.from, d.to); return line(d.from, d.to, s.bonds.length + (n + 1) / 2, c ? 0.5 : d.side, c ? 0 : 0.15 * BOND); }),
    ],
    dots,
    end: at(last),
  };
}
