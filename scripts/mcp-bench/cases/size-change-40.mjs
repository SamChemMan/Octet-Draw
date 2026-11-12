// Size (MCP v2 test plan R3, P1): one change of 40 operations, the most change takes: 20 structures drawn, then each
// recoloured and moved in one change.
const structures = Array.from({ length: 20 }, (_, i) => ({ text: `${"C".repeat(1 + (i % 12))}O`, number: String(i + 1) }));
// (A draw lists each structure it made in compounds: "1 s2 CH4O", plan 19.11.)
const ids = (r) => r.compounds.map((c) => /^(?:\S+ )?(s\d+) /.exec(c)[1]);
const ops = (made) => made.flatMap((id) => [{ op: "edit", ids: [id], colour: "#2040c0" }, { op: "move", ids: [id], dx: 0.5, dy: 0 }]);
export default {
  about: "One change of 40 operations on 20 structures (test plan R3)",
  calls: [{ name: "draw", arguments: { kind: "structures", structures } }, { name: "change", arguments: (results) => ({ operations: ops(ids(results[0])) }) }],
};
