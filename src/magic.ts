// The facts of the overlay that shows while an AI app works (McpMagic.tsx), kept apart from it so a check can read
// them (motion.check.ts): how long it stays, how Octet's mark draws itself in it, and the molecules of Image to
// Structure's first-use card.
import type { Mol } from "./render.ts";

// The overlay stays this long (ms) after an AI app's last call that changes the drawing. An AI app thinks between
// calls, often for some seconds, so a run of calls reads as one piece of work.
export const LINGER = 8000;
// The window stays soft this long (ms) after a call: calls that come close together read as one, and the fade in
// always ends before the fade out starts. Then the drawing is clear again, but for the mark.
export const HOLD = 1000;

type P = [number, number];
// Octet's mark as app-icon.svg draws it, in its own units (1000 across, y down): an octagon with a hexagonal hole.
export const OCTAGON: P[] = [[292.89, 0], [707.11, 0], [1000, 292.89], [1000, 707.11], [707.11, 1000], [292.89, 1000], [0, 707.11], [0, 292.89]];
export const HEXAGON: P[] = [[500, 83], [861.13, 291.5], [861.13, 708.5], [500, 917], [138.87, 708.5], [138.87, 291.5]];
// The mark's width in the overlay (px), and its line: Octet's bond width for a bond the hexagon's side (ACS 1996:
// 0.6 pt for 14.4 pt, a 24th), to the nearest pixel.
export const MARK = 112, LINE = 2;
// Times are in steps of --motion (180 ms): when each part starts. The hexagon's six bonds draw one after another,
// then the three inner lines of a Kekulé benzene, then the octagon's eight edges sweep round it. At FILL the solid
// mark fades in and the inner lines fade out.
export const LEAD = 1.5, FILL = 11;
const HEX_EACH = 0.55, KEKULE = 5.4, KEKULE_EACH = 0.7, OCT = 8, OCT_EACH = 0.3;

// A line from a to b (px, about the mark's middle), `off` px to the right of a → b, cut short by `cut` px at each end.
function line(a: P, b: P, at: number, off = 0, cut = 0) {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / length, uy = (b[1] - a[1]) / length;
  return { x: a[0] + ux * cut - uy * off, y: a[1] + uy * cut + ux * off, turn: (Math.atan2(uy, ux) * 180) / Math.PI, length: length - 2 * cut, at };
}
// A ring's edges in px about the mark's middle, each moved out from it by `by` px (in, when by is negative): the ring
// grows about its middle, so its edges still meet.
const edges = (pts: P[], by: number) => pts.map((p, k): [P, P] => {
  const [a, b] = [p, pts[(k + 1) % pts.length]].map(([x, y]): P => [((x - 500) * MARK) / 1000, ((y - 500) * MARK) / 1000]);
  const s = 1 + by / Math.hypot((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
  return [[a[0] * s, a[1] * s], [b[0] * s, b[1] * s]];
});

// The mark as McpMagic draws it. Both rings go clockwise from the top, so a line's right is inside its ring. The
// hexagon's bonds lie just outside the hole and the octagon's edges just inside its outline, so every line is under
// the solid mark when it comes and the hole's edge does not move. The inner lines are as the page draws a ring's
// double bond (render.ts): 18% of the bond in from it, cut back to the bisector of the ring's angle at each end (120°:
// the spacing over tan 60°).
export function mark() {
  const hex = edges(HEXAGON, LINE / 2), oct = edges(OCTAGON, -LINE / 2);
  const spacing = 0.18 * Math.hypot(hex[0][1][0] - hex[0][0][0], hex[0][1][1] - hex[0][0][1]);
  return {
    bonds: hex.map(([a, b], k) => line(a, b, LEAD + k * HEX_EACH)),
    inner: [0, 2, 4].map((k, n) => line(hex[k][0], hex[k][1], KEKULE + n * KEKULE_EACH, spacing, spacing / Math.tan(Math.PI / 3))),
    edges: oct.map(([a, b], k) => line(a, b, OCT + k * OCT_EACH)),
  };
}

// Image to Structure's first-use card (McpMagic.tsx PictureDemo): small drug molecules, each read from a picture and
// drawn by Octet. Laid out by Octet's own Name to Structure (Indigo) and kept here, so the card draws at once: atoms
// [element, x, y] in bond lengths (y up), bonds [from, to, order].
const DEMOS: [string, [string, number, number][], [number, number, number][]][] = [
  ["aspirin",
    [["C", -3, 0], ["C", -2.5, 0.866], ["O", -3, 1.732], ["O", -1.5, 0.866], ["C", -1, 0], ["C", -1.5, -0.866], ["C", -1, -1.732], ["C", 0, -1.732], ["C", 0.5, -0.866], ["C", 0, 0], ["C", 0.5, 0.866], ["O", 0, 1.732], ["O", 1.5, 0.866]],
    [[0, 1, 1], [1, 2, 2], [1, 3, 1], [3, 4, 1], [4, 5, 2], [5, 6, 1], [6, 7, 2], [7, 8, 1], [8, 9, 2], [9, 4, 1], [9, 10, 1], [10, 11, 2], [10, 12, 1]]],
  ["caffeine",
    [["C", -1.721, -0.461], ["N", -0.978, 0.208], ["C", -1.083, 1.202], ["N", -0.169, 1.609], ["C", 0.5, 0.866], ["C", 0, 0], ["C", 0.5, -0.866], ["O", 0, -1.732], ["N", 1.5, -0.866], ["C", 2, -1.732], ["C", 2, 0], ["O", 3, 0], ["N", 1.5, 0.866], ["C", 2, 1.732]],
    [[0, 1, 1], [1, 2, 1], [2, 3, 2], [3, 4, 1], [4, 5, 2], [5, 1, 1], [5, 6, 1], [6, 7, 2], [6, 8, 1], [8, 9, 1], [8, 10, 1], [10, 11, 2], [10, 12, 1], [12, 4, 1], [12, 13, 1]]],
  ["paracetamol",
    [["C", -1.732, -1], ["C", -1.732, 0], ["O", -2.598, 0.5], ["N", -0.866, 0.5], ["C", 0, 0], ["C", 0, -1], ["C", 0.866, -1.5], ["C", 1.732, -1], ["O", 2.598, -1.5], ["C", 1.732, 0], ["C", 0.866, 0.5]],
    [[0, 1, 1], [1, 2, 2], [1, 3, 1], [3, 4, 1], [4, 5, 2], [5, 6, 1], [6, 7, 2], [7, 8, 1], [7, 9, 1], [9, 10, 2], [10, 4, 1]]],
  ["ibuprofen",
    [["C", -3.464, 0], ["C", -3.464, 1], ["C", -4.33, 1.5], ["C", -2.598, 1.5], ["C", -1.732, 1], ["C", -1.732, 0], ["C", -0.866, -0.5], ["C", 0, 0], ["C", 0, 1], ["C", -0.866, 1.5], ["C", 0.866, -0.5], ["C", 0.866, -1.5], ["C", 1.732, 0], ["O", 1.732, 1], ["O", 2.598, -0.5]],
    [[0, 1, 1], [1, 2, 1], [1, 3, 1], [3, 4, 1], [4, 5, 2], [5, 6, 1], [6, 7, 2], [7, 8, 1], [8, 9, 2], [9, 4, 1], [7, 10, 1], [10, 11, 1], [10, 12, 1], [12, 13, 2], [12, 14, 1]]],
];
export const DEMO_MOLS: { id: string; mol: Mol }[] = DEMOS.map(([id, atoms, bonds]) => ({
  id: `picture-demo-${id}`,
  mol: { atoms: atoms.map(([label, x, y]) => ({ label, location: [x, y, 0] })), bonds: bonds.map(([a, b, type]) => ({ type, atoms: [a, b] })) },
}));
