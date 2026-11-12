// The taxol job as an AI app did it with the v1 tools on 10 November 2026 (docs/plans/mcp-v2.md, section 0). No record
// of that chat's calls was kept, so this is rebuilt from the plan's notes: the six kinds of refused call, the check
// grid of all 20 compounds, the style and page changed three times, the three schemes, their titles, and the reads
// and row moves that fixed the layout. The v2 form of the same job is taxol-route.
// It is the same job, call for call, written with the five tools of v2 (plan 5.1): the v1 names are gone.
// Since Octet reads arguments leniently (plan section 6), the six calls go through, each marked "v1 refused" below, and
// the call after each one, which was the AI app's second try, does the same thing again.
// The row moves below are fixed distances, not fitted to any layout, so what its reads list after them changes when
// Octet's layout does (a draw that clears its own labels, plan 19.5: 169,999 characters read became 170,273).
import { readFileSync } from "node:fs";
const json = (f) => JSON.parse(readFileSync(new URL(`../taxol/${f}.json`, import.meta.url), "utf8"));
const structures = json("structures"), schemes = ["scheme1", "scheme2", "scheme3"].map(json);
const grid = (number) => ({ structures: Object.entries(structures).map(([n, text]) => ({ text, number: number(n) })) });
// (A draw lists each structure it made in compounds, "1 s2 C20H28O6", and its other ids in made: plan 19.11. A
// replace lists its structure in made.)
const made = (k, kind = "s") => (r) => (kind === "s" && r[k].compounds ? r[k].compounds.map((c) => /^(?:\S+ )?(s\d+) /.exec(c)[1]) : r[k].made.filter((id) => id.startsWith(kind)));
const TITLES = ["Scheme 1. The C-ring aldehyde 7", "Scheme 2. The ABC ring system 13", "Scheme 3. Taxol (1) from 13"];
export default {
  about: "Nicolaou's taxol synthesis as v1 was used for it: about 35 calls, 6 refused, most of the rest checking and fixing (rebuilt from the plan's notes)",
  // The brief: a paper, as v1 drew it (A4, ACS Document 1996), so its page warnings compare.
  brief: { destination: { kind: "paper" } },
  calls: [
    { name: "drawings", arguments: { action: "new" } }, // v1 refused: for is missing
    { name: "drawings", arguments: { action: "new", for: "paper" } },
    { name: "advanced", arguments: { tool: "set_style", args: { preset: "Nature" } } },
    { name: "draw", arguments: { kind: "structures", ...grid(Number) } }, // v1 refused: number is not text
    { name: "draw", arguments: { kind: "structures", ...grid(String) } },
    { name: "read", arguments: { detail: "summary" } }, // v1 refused: not one of short, full
    { name: "read", arguments: {} },
    { name: "read", arguments: (r) => ({ format: "MOL", ids: [made(4)(r)[0]] }) }, // v1 refused: not one of cdxml, mol, ...
    { name: "read", arguments: (r) => ({ format: "mol", ids: [made(4)(r)[0]] }) },
    { name: "change", arguments: (r) => ({ operations: [{ op: "replace", structure: made(4)(r)[0], text: r[8].text }] }) }, // v1 refused: Octet cannot read its own MOL text
    // The check grid goes: both times it was drawn, and the structure that replaced the first of the second grid.
    { name: "change", arguments: (r) => ({ operations: [{ op: "delete", ids: [...made(3)(r), ...made(4)(r).slice(1), ...made(9)(r)] }] }) },
    { name: "advanced", arguments: { tool: "set_style", args: { page: "A3" } } },
    { name: "advanced", arguments: { tool: "set_style", args: { page: "A3", landscape: true } } },
    ...schemes.map((arguments_) => ({ name: "draw", arguments: { kind: "reaction", ...arguments_ } })),
    { name: "change", arguments: { operations: [{ op: "draw", kind: "structures", structures: [{ text: structures[20], number: "20" }] }, { op: "text", text: "β-lactam", below: "$1.made" }] } }, // v1 refused: $1.made names 2 objects
    ...schemes.flatMap((_, k) => [
      { name: "change", arguments: (r) => ({ operations: [{ op: "text", text: TITLES[k], bold: true, above: made(13 + k)(r)[0] }] }) },
      { name: "read", arguments: { detail: "full" } },
      { name: "change", arguments: (r) => ({ operations: [{ op: "move", ids: [...made(13 + k)(r), ...made(13 + k, "a")(r)], dy: -6 * (k + 1) }] }) },
      { name: "change", arguments: (r) => ({ operations: [{ op: "move", ids: made(13 + k)(r).slice(-2), dx: -2 }] }) },
      { name: "read", arguments: {} },
    ]),
    { name: "read", arguments: { detail: "full" } },
  ],
  expect: { smiles: Object.fromEntries(Object.entries(structures).filter(([n]) => n !== "20")) },
};
