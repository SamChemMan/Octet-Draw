// Run: node src/richtext.check.ts. Fails loudly if rich text editing breaks.
import assert from "node:assert/strict";
import { common, edited, lines, normalise, plainOf, styleRange, wrap, type TextRun } from "./richtext.ts";

const base: TextRun[] = [{ text: "H2O and CO2" }];
// Subscript the 2 in H2O: three runs, the middle one subscripted.
const sub = styleRange(base, 1, 2, (s) => ({ ...s, script: "sub" }));
assert.deepEqual(sub, [{ text: "H" }, { text: "2", script: "sub" }, { text: "O and CO2" }]);
assert.equal(plainOf(sub), "H2O and CO2");
// Bold over a range that crosses the subscript keeps it subscripted.
const bold = styleRange(sub, 0, 3, (s) => ({ ...s, bold: true }));
assert.deepEqual(bold.map((r) => [r.text, !!r.bold, r.script]), [["H", true, undefined], ["2", true, "sub"], ["O", true, undefined], [" and CO2", false, undefined]]);
// The style a range shares, and the style at the caret.
assert.deepEqual(common(bold, 0, 3), { bold: true });
assert.deepEqual(common(bold, 2, 2), { bold: true, script: "sub" });
// Typing after the subscript 2 carries its style on; a pending style wins.
assert.deepEqual(edited(sub, "H22O and CO2").map((r) => r.text), ["H", "22", "O and CO2"]);
assert.deepEqual(edited(sub, "H2xO and CO2", {}).map((r) => [r.text, r.script]), [["H", undefined], ["2", "sub"], ["xO and CO2", undefined]]);
// Deleting the subscript removes its run; undoing a style merges runs back.
assert.deepEqual(edited(sub, "HO and CO2"), [{ text: "HO and CO2" }]);
assert.deepEqual(styleRange(sub, 1, 2, (s) => ({ ...s, script: undefined })), [{ text: "H2O and CO2" }]);
// Lines split at newlines, styles kept.
assert.deepEqual(lines([{ text: "a\nb", bold: true }]), [[{ text: "a", bold: true }], [{ text: "b", bold: true }]]);
assert.deepEqual(normalise([{ text: "" }]), [{ text: "" }]);
// A caption width: lines break at the last space that fits, keep every character's place, and a word wider than the
// width has a line of its own. Each character is 1 wide here, a bold one 2.
{
  const w = (t: string, s: { bold?: true }) => t.length * (s.bold ? 2 : 1);
  assert.deepEqual(wrap([{ text: "aa bb cc" }], 5, w), { runs: [{ text: "aa bb\ncc" }], soft: [5] });
  assert.deepEqual(wrap([{ text: "aa bb cc" }], 100, w).soft, []);
  assert.deepEqual(wrap([{ text: "aaaaaaa b" }], 3, w), { runs: [{ text: "aaaaaaa\nb" }], soft: [7] });
  assert.deepEqual(wrap([{ text: "aa " }, { text: "bb", bold: true }, { text: " c\nd e" }], 5, w).soft, [2, 5]);
}
console.log("richtext.check: ok");
