// The library's π complexes, drawn as Octet draws a π ligand (ChemDraw's j and Shift+J keys, edit.ts addGroupAt): a
// Cp or arene ring in perspective, joined to its metal through a multi-centre point, the near bonds bold and wedged.
// Clean Up leaves a structure with a multi-centre attachment as drawn. Carbonyls are M=C=O, as common.ts draws them.
import { addGroupAt, bondTo, pos, setLabel } from "../../src/edit.ts";

const deg = Math.PI / 180;
const add = (a, b) => [a[0] + b[0], a[1] + b[1]], sub = (a, b) => [a[0] - b[0], a[1] - b[1]], mul = (a, s) => [a[0] * s, a[1] * s];
const unit = (a) => mul(a, 1 / Math.hypot(a[0], a[1]));
const r3 = (v) => Math.round(v * 1000) / 1000 + 0;

// A metal on its own: an element, or M (any metal).
const metal = (label) => ({ atoms: [label === "M" ? { label: "C", text: "M", location: [0, 0, 0] } : { label, location: [0, 0, 0] }], bonds: [] });
// The ring atoms of each π ligand, by its multi-centre point.
const ringsOf = (m) => m.atoms.flatMap((a, i) => (a.centre ? [{ point: i, ring: a.centre.atoms }] : []));
// A π ligand on metal 0: Cp (5) or an arene (6), below the metal first, then above.
const ligand = (m, n) => addGroupAt(m, 0, n === 5 ? "cpLigand" : "phenylLigand")[0];
// A methyl (or a group) on ring atom r, pointing out from the ring's middle.
function outward(m, point, r, length = 1) {
  const d = unit(sub(pos(m, r), pos(m, point)));
  return bondTo(m, r, add(pos(m, r), mul(d, length)));
}
const methyls = (m, { point, ring }, which = ring) => which.reduce((x, r) => outward(x, point, r), m);
// Carbonyls on metal 0 at the angles given (degrees anticlockwise from the right): M=C=O.
function carbonyls(m, angles) {
  for (const t of angles) {
    const d = [Math.cos(t * deg), Math.sin(t * deg)];
    m = bondTo(m, 0, d, { type: 2 });
    const c = m.atoms.length - 1;
    m = setLabel(bondTo(m, c, mul(d, 2), { type: 2 }), c + 1, "O");
  }
  return m;
}
// Turns the atoms given about the metal (atom 0) by t degrees anticlockwise: a bent metallocene's rings.
function turn(m, ids, t) {
  const c = Math.cos(t * deg), s = Math.sin(t * deg);
  return { ...m, atoms: m.atoms.map((a, i) => (ids.includes(i) ? { ...a, location: [a.location[0] * c - a.location[1] * s, a.location[0] * s + a.location[1] * c, 0] } : a)) };
}
// Centred on its atoms' box, rounded.
function done(m) {
  const xs = m.atoms.map((a) => a.location[0]), ys = m.atoms.map((a) => a.location[1]), c = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
  return { atoms: m.atoms.map((a) => ({ ...a, location: [r3(a.location[0] - c[0]), r3(a.location[1] - c[1]), 0] })), bonds: m.bonds };
}

const sandwich = (el, n = 5) => ligand(ligand(metal(el), n), n);
// The ring atom furthest along d (a substituent's place).
const furthest = (m, ring, d) => ring.reduce((a, b) => (pos(m, a)[0] * d[0] + pos(m, a)[1] * d[1] >= pos(m, b)[0] * d[0] + pos(m, b)[1] * d[1] ? a : b));

function cymene() {
  let m = ligand(metal("M"), 6);
  const [L] = ringsOf(m), left = furthest(m, L.ring, [-1, 0]), right = furthest(m, L.ring, [1, 0]);
  m = outward(m, L.point, left);
  m = outward(m, L.point, right);
  const ch = m.atoms.length - 1, at = pos(m, ch);
  m = bondTo(m, ch, add(at, [0.5, 0.866]));
  return bondTo(m, ch, add(at, [0.5, -0.866]));
}
function bent(el) {
  let m = sandwich(el);
  const [low, high] = ringsOf(m);
  m = turn(m, [low.point, ...low.ring], -35);
  m = turn(m, [high.point, ...high.ring], 35);
  for (const t of [35, -35]) { m = bondTo(m, 0, [Math.cos(t * deg), Math.sin(t * deg)]); m = setLabel(m, m.atoms.length - 1, "Cl"); }
  return m;
}
function dppf() {
  let m = sandwich("Fe");
  for (const { point, ring } of ringsOf(m)) { m = outward(m, point, furthest(m, ring, [1, 0])); m = setLabel(m, m.atoms.length - 1, "PPh2"); }
  return m;
}

export const CP_RINGS = [
  { name: "CpM", also: "η5-cyclopentadienyl, half-sandwich, piano stool", mol: done(ligand(metal("M"), 5)) },
  { name: "Cp*M", also: "η5-pentamethylcyclopentadienyl, half-sandwich, piano stool", mol: done((() => { const m = ligand(metal("M"), 5); return methyls(m, ringsOf(m)[0]); })()) },
  { name: "(η6-Benzene)M", also: "arene, half-sandwich, piano stool", mol: done(ligand(metal("M"), 6)) },
  { name: "(η6-p-Cymene)M", also: "arene, half-sandwich, piano stool", mol: done(cymene()) },
  { name: "(η6-C6Me6)M", also: "hexamethylbenzene, arene, half-sandwich", mol: done((() => { const m = ligand(metal("M"), 6); return methyls(m, ringsOf(m)[0]); })()) },
  { name: "Cp2M", also: "metallocene, sandwich", mol: done(sandwich("M")) },
];
export const METALLOCENES = [
  { name: "Ferrocene", also: "Cp2Fe, sandwich", mol: done(sandwich("Fe")) },
  { name: "Ruthenocene", also: "Cp2Ru, sandwich", mol: done(sandwich("Ru")) },
  { name: "Osmocene", also: "Cp2Os, sandwich", mol: done(sandwich("Os")) },
  { name: "Cobaltocene", also: "Cp2Co, sandwich", mol: done(sandwich("Co")) },
  { name: "Nickelocene", also: "Cp2Ni, sandwich", mol: done(sandwich("Ni")) },
  { name: "Decamethylferrocene", also: "Cp*2Fe, sandwich", mol: done((() => { let m = sandwich("Fe"); for (const L of ringsOf(m)) m = methyls(m, L); return m; })()) },
  { name: "Cp2TiCl2", also: "titanocene dichloride, bent metallocene", mol: done(bent("Ti")) },
  { name: "Cp2ZrCl2", also: "zirconocene dichloride, bent metallocene", mol: done(bent("Zr")) },
  { name: "(Benzene)Cr(CO)3", also: "benzenechromium tricarbonyl, arene, piano stool", mol: done(carbonyls(ligand(metal("Cr"), 6), [90, 140, 40])) },
  { name: "CpMn(CO)3", also: "cymantrene, piano stool", mol: done(carbonyls(ligand(metal("Mn"), 5), [90, 140, 40])) },
  { name: "Bis(benzene)chromium", also: "Cr(C6H6)2, sandwich, arene", mol: done(sandwich("Cr", 6)) },
];
export const DPPF = { name: "dppf", also: "1,1'-bis(diphenylphosphino)ferrocene", mol: done(dppf()) };
