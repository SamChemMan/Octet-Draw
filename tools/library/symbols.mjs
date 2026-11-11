// The library's Symbols set: shapes the Shape tool does not draw (stars, polygons, a burst, a tick and a cross, a bolt,
// the sex symbols, a target) and safety signs (warning triangles, the radiation trefoil and GHS hazard diamonds), in
// the Lab group's line style (art.mjs path data, 40 units to a bond length, y down). Each is worked out here from
// simple geometry.
import { art, circle, fine, ink, solid } from "./art.mjs";

const PER = { per: 40 };
const f = (v) => Math.round(v * 100) / 100;
const deg = Math.PI / 180;
const pt = (r, a) => `${f(r * Math.cos(a * deg))} ${f(r * Math.sin(a * deg))}`;
// A closed polygon through points at radii rs (in turn) and even angles, the first straight up.
const polygon = (n, rs, start = -90) => `M${Array.from({ length: n }, (_, k) => pt(rs[k % rs.length], start + (360 / n) * k)).join("L")}Z`;

const star = () => art("Star", "five-pointed star, shape", PER, [ink(polygon(10, [40, 16]))]);
const hexagon = () => art("Hexagon", "polygon, shape", PER, [ink(polygon(6, [36], -90))]);
const octagon = () => art("Octagon", "polygon, stop, shape", PER, [ink(polygon(8, [36], -112.5))]);
const pentagon = () => art("Pentagon", "polygon, shape", PER, [ink(polygon(5, [36]))]);
const burst = () => art("Burst", "starburst, explosion, flash, shape", PER, [ink(polygon(24, [40, 28, 36, 26]))]);
const tick = () => art("Tick mark", "check mark, tick, correct, yes", PER, [ink(`M-34 0L-22 -12L-8 2L22 -30L34 -18L-8 24Z`)]);
const cross = () => art("Cross", "X, wrong, no", PER, [ink(`M-28 -36L0 -8L28 -36L36 -28L8 0L36 28L28 36L0 8L-28 36L-36 28L-8 0L-36 -28Z`)]);
const bolt = () => art("Lightning bolt", "electricity, high voltage, energy, flash", PER, [ink(`M6 -44L-18 4L-2 4L-10 44L20 -8L4 -8L14 -44Z`)]);
const male = () => art("Male symbol", "male, Mars, ♂", PER, [ink(circle(-8, 8, 22)), ink(`M8 -8L30 -30M14 -30L30 -30L30 -14`)]);
const female = () => art("Female symbol", "female, Venus, ♀", PER, [ink(circle(0, -10, 22)), ink(`M0 12L0 42M-12 30L12 30`)]);
const target = () => art("Target", "crosshair, bullseye, aim", PER, [ink(circle(0, 0, 36)), ink(circle(0, 0, 18)), ink(`M0 -44L0 -26M0 26L0 44M-44 0L-26 0M26 0L44 0`), solid(circle(0, 0, 3))]);

// Warning triangle with rounded corners, and what it holds.
const triangle = (inner) => [ink(`M-6 -40Q0 -48 6 -40L44 26Q48 34 40 34L-40 34Q-48 34 -44 26Z`), ...inner];
const warning = () => art("Warning sign", "caution, danger, exclamation, hazard", PER, triangle([solid(`M-3 -16L3 -16L2 12L-2 12Z`), solid(circle(0, 21, 3))]));
const highVoltage = () => art("High voltage sign", "electrical hazard, danger, lightning", PER, triangle([solid(`M4 -18L-10 8L-1 8L-6 26L10 -2L1 -2L7 -18Z`)]));
// Radiation trefoil: a circle in the middle and three blades, each a sixth of a ring, 120° apart.
function radiation() {
  const r0 = 8, r1 = 14, r2 = 40, blade = (a) => `M${pt(r1, a - 30)}L${pt(r2, a - 30)}A${r2} ${r2} 0 0 1 ${pt(r2, a + 30)}L${pt(r1, a + 30)}A${r1} ${r1} 0 0 0 ${pt(r1, a - 30)}Z`;
  return art("Radiation symbol", "trefoil, radioactive, ionising radiation, hazard", PER, [solid(circle(0, 0, r0)), ...[-90, 30, 150].map((a) => solid(blade(a))), ink(circle(0, 0, 46))]);
}
// GHS hazard diamonds (a square on its point) and their pictograms.
const diamond = (inner) => [ink(`M0 -46L46 0L0 46L-46 0Z`), ...inner];
// A flame: an outline that leans and licks up to its tip, and a smaller one inside it, filled. (x, y) is its middle.
const flame = (x, y, s) => {
  const p = (px, py) => `${f(x + px * s)} ${f(y + py * s)}`;
  return [ink(`M${p(0, -26)}C${p(8, -15)} ${p(17, -9)} ${p(15, 6)}C${p(14, 15)} ${p(8, 20)} ${p(0, 20)}C${p(-9, 20)} ${p(-16, 14)} ${p(-15, 4)}C${p(-14, -4)} ${p(-8, -7)} ${p(-6, -15)}C${p(-2, -9)} ${p(0, -11)} ${p(0, -26)}Z`),
    solid(`M${p(0, -4)}C${p(4, 2)} ${p(8, 6)} ${p(7, 12)}C${p(6, 17)} ${p(3, 18)} ${p(0, 18)}C${p(-4, 18)} ${p(-8, 15)} ${p(-7, 10)}C${p(-6, 5)} ${p(-2, 3)} ${p(0, -4)}Z`)];
};
const ghsFlame = () => art("Flammable (GHS02)", "flame, flammable, GHS, hazard pictogram", PER, diamond([...flame(0, -4, 1), solid(`M-14 22L14 22L14 26L-14 26Z`)]));
const ghsOxidiser = () => art("Oxidising (GHS03)", "flame over circle, oxidiser, oxidizer, GHS, hazard pictogram", PER, diamond([...flame(0, -12, 0.75), ink(circle(0, 12, 8)), solid(`M-12 25L12 25L12 28L-12 28Z`)]));
const ghsGas = () => art("Gas under pressure (GHS04)", "gas cylinder, compressed gas, GHS, hazard pictogram", PER, diamond([ink(`M-24 6L16 6Q24 6 24 12Q24 18 16 18L-24 18Z`), ink(`M24 10L30 10L30 14L24 14`)]));
const ghsHarmful = () => art("Harmful (GHS07)", "exclamation mark, irritant, harmful, GHS, hazard pictogram", PER, diamond([solid(`M-4 -24L4 -24L2 10L-2 10Z`), solid(circle(0, 20, 4))]));

export const SYMBOLS = [star(), pentagon(), hexagon(), octagon(), burst(), tick(), cross(), bolt(), male(), female(), target(), warning(), highVoltage(), radiation(),
  ghsFlame(), ghsOxidiser(), ghsGas(), ghsHarmful()];
