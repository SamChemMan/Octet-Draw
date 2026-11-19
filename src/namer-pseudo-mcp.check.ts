// Run: node src/namer-pseudo-mcp.check.ts. The AI apps' tools with names that have r and s (issue 82), in Octet with no
// window (scripts/headless), which wires names as the window does: draw reads them, read gives them, and a name Octet
// cannot read is refused with its line and draws nothing. Two sessions reading one drawing at once get one name.
import assert from "node:assert/strict";
import { needOpsin } from "../scripts/checkkit.ts";

needOpsin("namer-pseudo-mcp.check: skipped (no OPSIN build)");
const { load, drawing, session } = await import("../scripts/headless/host.ts");
const { handle } = await import("./mcp.ts");
const { toInchi } = await import("./chem.ts");
await load();

const d = drawing("paper", "r and s");
let n = 0;
const call = async (name: string, args: unknown, who = "check") => JSON.parse(await handle(JSON.stringify({ jsonrpc: "2.0", id: ++n, method: "tools/call", params: { name, arguments: args } }), () => d.host, "1", session("Check", who))).result;
assert.ok(!(await call("set_brief", { destination: { kind: "paper" } })).isError);

// draw reads names with r and s; read gives Octet's name with them.
const drew = await call("draw", { lines: "(1r,4r)-4-(aminomethyl)cyclohexane-1-carboxylic acid\n(1s,4s)-4-(aminomethyl)cyclohexane-1-carboxylic acid\nOC[C@@H](O)[C@H](O)[C@@H](O)CO\nO[C@H]1[C@H](O)[C@@H](O)[C@H](O)[C@H](O)[C@@H]1O" });
assert.ok(!drew.isError, drew.content[0].text);
assert.match(drew.content[0].text, /s1 C8H15NO2 \(r,r\)/);
assert.match(drew.content[0].text, /s2 C8H15NO2 \(s,s\)/);
const read = (await call("read", { detail: "full" })).structuredContent;
const named = Object.fromEntries(read.structures.map((s: { id: string; name?: string }) => [s.id, s.name]));
assert.deepEqual(named, {
  s1: "(1r,4r)-4-(aminomethyl)cyclohexane-1-carboxylic acid", s2: "(1s,4s)-4-(aminomethyl)cyclohexane-1-carboxylic acid",
  s3: "(2R,3r,4S)-pentane-1,2,3,4,5-pentaol", s4: undefined, // myo-inositol: no name
});
// trans and cis as their InChIs say (the second number of /t: 7- trans, 7+ cis).
assert.match(read.structures[0].inchi, /\/t6-,7-$/);
assert.match(read.structures[1].inchi, /\/t6-,7\+$/);
assert.equal(read.structures[2].inchi, toInchi("OC[C@@H](O)[C@H](O)[C@@H](O)CO"));

// Two sessions reading at once: one name each, the same.
const [a, b] = await Promise.all([call("read", { detail: "full" }, "one"), call("read", { detail: "full" }, "two")]);
assert.deepEqual(a.structuredContent.structures.map((s: { name?: string }) => s.name), b.structuredContent.structures.map((s: { name?: string }) => s.name));

// Bad names: refused with the line, nothing drawn, no exception.
const before = read.structures.length;
for (const lines of ["(1q,4r)-4-methylcyclohexan-1-ol", "(9r)-pentane-1,2,3,4,5-pentol", "(1r,4r)-", "(1r,1s)-4-methylcyclohexan-1-ol", "(1r,4s)-4-methylcyclohexan-1-ol",
  `(${Array.from({ length: 300 }, (_, k) => `${k + 1}r`).join(",")})-4-methylcyclohexan-1-ol`]) {
  const r = await call("draw", { lines });
  assert.ok(r.isError, lines.slice(0, 40));
  assert.match(r.content[0].text, /Octet drew nothing\. Octet cannot read/);
}
assert.equal((await call("read", {})).structuredContent.structures.length, before, "nothing drawn");
console.log("namer-pseudo-mcp.check: draw and read with r and s, two sessions at once, bad names refused ok");
