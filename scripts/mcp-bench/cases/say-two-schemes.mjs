// The lab's speed job say-two-schemes (scripts/mcp-evals/speed.mjs) as Opus wrote it in lines (plan 19, round 3): two
// titled taxol schemes in one draw call. Octet's layout left labels on each other in 15 and 16 (s3, s4, s5), which cost
// the model 4 more calls; Octet now clears them, so the reply's check is clean.
import { readFileSync } from "node:fs";
const T = JSON.parse(readFileSync(new URL("../taxol/structures.json", import.meta.url), "utf8"));
export default {
  about: "say-two-schemes: two titled taxol schemes, 13 to 15 and 15 to 17, as lines in one draw call with the brief",
  brief: false,
  calls: [{ name: "draw", arguments: { brief: "quick", lines: `# Scheme 1. The C2 alcohol 15\n${T[13]} (13) -> ${T[14]} (14), a) Ac2O, DMAP; b) TPAP, NMO; 95%, 93%\n-> ${T[15]} (15), c) BH3·THF, then H2O2; d) HCl, MeOH; 55%, 80%\n\n# Scheme 2. The TES ether 17\n15 -> ${T[16]} (16), Ac2O, DMAP, CH2Cl2, 95%\n-> ${T[17]} (17), f) H2, Pd(OH)2/C; g) TESCl, pyridine; h) K2CO3, MeOH; 97%, 85%, 95%` } }],
  expect: { smiles: Object.fromEntries(["13", "14", "15", "16", "17"].map((n) => [n, T[n]])) },
};
