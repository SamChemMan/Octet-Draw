// The taxol job as an AI app did it with the v1 tools on 10 November 2026 (docs/plans/mcp-v2.md, section 0). No record
// of that chat's calls was kept, so this is rebuilt from the plan's notes: the six kinds of refused call, the check
// grid of all 20 compounds, the style and page changed three times, the three schemes, their titles, and the reads
// and row moves that fixed the layout. The v2 form of the same job is taxol-route.
import { readFileSync } from "node:fs";
const json = (f) => JSON.parse(readFileSync(new URL(`../taxol/${f}.json`, import.meta.url), "utf8"));
const structures = json("structures"), schemes = ["scheme1", "scheme2", "scheme3"].map(json);
const grid = (number) => ({ structures: Object.entries(structures).map(([n, text]) => ({ text, number: number(n) })) });
const made = (k, kind = "s") => (r) => r[k].made.filter((id) => id.startsWith(kind));
const TITLES = ["Scheme 1. The C-ring aldehyde 7", "Scheme 2. The ABC ring system 13", "Scheme 3. Taxol (1) from 13"];
export default {
  about: "Nicolaou's taxol synthesis as v1 was used for it: about 35 calls, 6 refused, most of the rest checking and fixing (rebuilt from the plan's notes)",
  calls: [
    { name: "new_drawing", arguments: {} }, // refused: for is missing
    { name: "new_drawing", arguments: { for: "paper" } },
    { name: "set_style", arguments: { preset: "Nature" } },
    { name: "draw_structures", arguments: grid(Number) }, // refused: number is not text
    { name: "draw_structures", arguments: grid(String) },
    { name: "read_drawing", arguments: { detail: "summary" } }, // refused: not one of short, full
    { name: "read_drawing", arguments: {} },
    { name: "get_file", arguments: (r) => ({ format: "MOL", ids: [r[4].made[0]] }) }, // refused: not one of cdxml, mol, ...
    { name: "get_file", arguments: (r) => ({ format: "mol", ids: [r[4].made[0]] }) },
    { name: "replace_structure", arguments: (r) => ({ structure: r[4].made[0], text: r[8].text }) }, // refused: Octet cannot read its own MOL text
    { name: "delete", arguments: (r) => ({ ids: made(4)(r) }) },
    { name: "set_style", arguments: { page: "A3" } },
    { name: "set_style", arguments: { page: "A3", landscape: true } },
    ...schemes.map((arguments_) => ({ name: "draw_reaction", arguments: arguments_ })),
    { name: "batch", arguments: { steps: [{ tool: "draw_structures", args: { structures: [{ text: structures[20], number: "20" }] } }, { tool: "add_text", args: { text: "β-lactam", below: "$1.made" } }] } }, // refused: $1.made names 2 objects
    ...schemes.flatMap((_, k) => [
      { name: "add_text", arguments: (r) => ({ text: TITLES[k], bold: true, above: made(13 + k)(r)[0] }) },
      { name: "read_drawing", arguments: { detail: "full" } },
      { name: "move", arguments: (r) => ({ ids: [...made(13 + k)(r), ...made(13 + k, "a")(r)], dy: -6 * (k + 1) }) },
      { name: "move", arguments: (r) => ({ ids: made(13 + k)(r).slice(-2), dx: -2 }) },
      { name: "read_drawing", arguments: {} },
    ]),
    { name: "read_drawing", arguments: { detail: "full" } },
  ],
  expect: { smiles: Object.fromEntries(Object.entries(structures).filter(([n]) => n !== "20")) },
};
