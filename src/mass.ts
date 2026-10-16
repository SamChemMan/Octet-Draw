// Mass spectra: a formula's isotope pattern (m/z and relative abundance), as ChemDraw's Analysis window shows it.
// Isotope masses and abundances: NIST Atomic Weights and Isotopic Compositions (public facts), for the elements
// organic and organometallic chemists draw. A formula with any other element has no pattern.

// Each element's isotopes: [mass, abundance in %].
const ISOTOPES: Record<string, [number, number][]> = {
  H: [[1.00782503207, 99.9885], [2.0141017778, 0.0115]],
  Li: [[6.015122795, 7.59], [7.01600455, 92.41]],
  B: [[10.012937, 19.9], [11.0093054, 80.1]],
  C: [[12, 98.93], [13.0033548378, 1.07]],
  N: [[14.0030740048, 99.636], [15.0001088982, 0.364]],
  O: [[15.99491461956, 99.757], [16.9991317, 0.038], [17.999161, 0.205]],
  F: [[18.99840322, 100]],
  Na: [[22.9897692809, 100]],
  Mg: [[23.9850417, 78.99], [24.98583692, 10], [25.982592929, 11.01]],
  Al: [[26.98153863, 100]],
  Si: [[27.9769265325, 92.223], [28.9764947, 4.685], [29.97377017, 3.092]],
  P: [[30.97376163, 100]],
  S: [[31.972071, 94.99], [32.97145876, 0.75], [33.9678669, 4.25], [35.96708076, 0.01]],
  Cl: [[34.96885268, 75.76], [36.96590259, 24.24]],
  K: [[38.96370668, 93.2581], [39.96399848, 0.0117], [40.96182576, 6.7302]],
  Ca: [[39.96259098, 96.941], [41.95861801, 0.647], [42.9587666, 0.135], [43.9554818, 2.086], [45.9536926, 0.004], [47.952534, 0.187]],
  Ti: [[45.9526316, 8.25], [46.9517631, 7.44], [47.9479463, 73.72], [48.94787, 5.41], [49.9447912, 5.18]],
  Cr: [[49.9460442, 4.345], [51.9405075, 83.789], [52.9406494, 9.501], [53.9388804, 2.365]],
  Mn: [[54.9380451, 100]],
  Fe: [[53.9396105, 5.845], [55.9349375, 91.754], [56.935394, 2.119], [57.9332756, 0.282]],
  Co: [[58.933195, 100]],
  Ni: [[57.9353429, 68.0769], [59.9307864, 26.2231], [60.931056, 1.1399], [61.9283451, 3.6345], [63.927966, 0.9256]],
  Cu: [[62.9295975, 69.15], [64.9277895, 30.85]],
  Zn: [[63.9291422, 48.268], [65.9260334, 27.975], [66.9271273, 4.102], [67.9248442, 19.024], [69.9253193, 0.631]],
  As: [[74.9215965, 100]],
  Se: [[73.9224764, 0.89], [75.9192136, 9.37], [76.919914, 7.63], [77.9173091, 23.77], [79.9165213, 49.61], [81.9166994, 8.73]],
  Br: [[78.9183371, 50.69], [80.9162906, 49.31]],
  Ru: [[95.907598, 5.54], [97.905287, 1.87], [98.9059393, 12.76], [99.9042195, 12.6], [100.9055821, 17.06], [101.9043493, 31.55], [103.905433, 18.62]],
  Rh: [[102.905504, 100]],
  Pd: [[101.905609, 1.02], [103.904036, 11.14], [104.905085, 22.33], [105.903486, 27.33], [107.903892, 26.46], [109.905153, 11.72]],
  Ag: [[106.905097, 51.839], [108.904752, 48.161]],
  Sn: [[111.904818, 0.97], [113.902779, 0.66], [114.903342, 0.34], [115.901741, 14.54], [116.902952, 7.68], [117.901603, 24.22], [118.903308, 8.59], [119.902194, 32.58], [121.903439, 4.63], [123.905273, 5.79]],
  I: [[126.904473, 100]],
  Cs: [[132.905451933, 100]],
  Ir: [[190.960594, 37.3], [192.9629264, 62.7]],
  Pt: [[189.959932, 0.012], [191.961038, 0.782], [193.96268, 32.967], [194.964791, 33.832], [195.964951, 25.242], [197.967893, 7.163]],
  Au: [[196.9665687, 100]],
};

// A formula as element counts: "C8H9NO2" or Indigo's "C8 H9 N O2". Undefined if it has anything else in it.
export function counts(formula: string): Record<string, number> | undefined {
  const out: Record<string, number> = {}, text = formula.replace(/\s+/g, "");
  if (!/^([A-Z][a-z]?\d*)+$/.test(text)) return undefined;
  for (const [, el, n] of text.matchAll(/([A-Z][a-z]?)(\d*)/g)) out[el] = (out[el] ?? 0) + (n ? Number(n) : 1);
  return out;
}

// The isotope pattern: peaks at each nominal mass (their mass the abundance-weighted mean of the isotopologues
// there), each as a percentage of the largest, largest first by mass. Peaks under `least` % are left out.
export function isotopePattern(formula: string, least = 0.5): { mz: number; rel: number }[] | undefined {
  const n = counts(formula);
  if (!n || Object.keys(n).some((el) => !ISOTOPES[el]) || Object.values(n).reduce((a, b) => a + b, 0) > 2000) return undefined;
  // Convolve one atom at a time, keeping peaks above a tiny share so big molecules stay quick.
  let peaks: [number, number][] = [[0, 1]];
  for (const [el, k] of Object.entries(n)) {
    const iso = ISOTOPES[el].map(([m, a]) => [m, a / 100] as [number, number]);
    for (let i = 0; i < k; i++) {
      const next = new Map<number, [number, number]>();
      for (const [m, p] of peaks) for (const [im, ip] of iso) {
        const mass = m + im, prob = p * ip, key = Math.round(mass * 1000);
        const was = next.get(key);
        next.set(key, was ? [(was[0] * was[1] + mass * prob) / (was[1] + prob), was[1] + prob] : [mass, prob]);
      }
      const top = Math.max(...[...next.values()].map((x) => x[1]));
      peaks = [...next.values()].filter((x) => x[1] > top * 1e-6);
    }
  }
  // Merge the fine structure at each nominal mass.
  const nominal = new Map<number, [number, number]>();
  for (const [m, p] of peaks) {
    const key = Math.round(m), was = nominal.get(key);
    nominal.set(key, was ? [(was[0] * was[1] + m * p) / (was[1] + p), was[1] + p] : [m, p]);
  }
  const top = Math.max(...[...nominal.values()].map((x) => x[1]));
  return [...nominal.values()].map(([mz, p]) => ({ mz, rel: (p / top) * 100 })).filter((x) => x.rel >= least).sort((a, b) => a.mz - b.mz);
}

// "C 63.56 H 6.00 N 9.27 O 21.17" (Indigo's mass composition) as chemists write an elemental analysis.
export const elementalAnalysis = (composition: string) =>
  composition.trim().split(/\s+/).reduce<string[]>((out, x, i, all) => (i % 2 ? out : [...out, `${x}, ${all[i + 1]}`]), []).join("; ");
