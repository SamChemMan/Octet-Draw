// Size (MCP v2 test plan R3, P1): a large CDXML given to advanced add_file. The 200 structures of size-200-structures
// are drawn and read as CDXML (about 240,000 characters), then added again from that text.
const structures = Array.from({ length: 200 }, (_, i) => ({ text: `${"C".repeat(1 + (i % 12))}O`, number: String(i + 1) }));
export default {
  about: "A CDXML of 200 structures read back with advanced add_file (test plan R3)",
  calls: [
    { name: "draw", arguments: { kind: "structures", structures } },
    { name: "read", arguments: { format: "cdxml" } },
    { name: "advanced", arguments: (results) => ({ tool: "add_file", args: { text: results[1].text } }) },
  ],
};
