// Run: node src/motion.check.ts. Fails loudly if a motion value is typed by hand instead of taken from the motion tokens,
// if tokens.css and tokens.json disagree on them, or if the toolbar drop's overshoot is used anywhere else.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const css = read("./editor.css"), tokensCss = read("../brand/tokens.css");
const json = JSON.parse(read("../brand/tokens.json")) as { motion: { tokens: { name: string; value: string }[] } };

// tokens.css has every motion token in tokens.json, with the same value.
for (const t of json.motion.tokens) assert.equal(new RegExp(`--${t.name}: ([^;]+);`).exec(tokensCss)?.[1], t.value, `--${t.name}`);
// Fades and slides stay within 150-200 ms (the toolbar drop is the one exception).
for (const t of json.motion.tokens.filter((x) => x.name.startsWith("motion") && x.name !== "motion-drop")) {
  const ms = parseFloat(t.value);
  assert.ok(ms >= 150 && ms <= 200, `--${t.name} is ${t.value}`);
}

// Every transition and animation in editor.css uses the tokens. The only times typed by hand: the carried option's
// lean (90 ms, shorter than any token), the ripple's step and the loops that pulse while something waits.
const lines = css.split("\n").map((text, i) => ({ text, line: i + 1 })).filter((l) => /^\s+(transition|animation)(-delay)?:/.test(l.text));
assert.ok(lines.length > 100, "found the motion rules");
for (const { text, line } of lines) {
  const left = text.replace(/var\(--[\w-]+\)/g, "").replace("transform 90ms", "").replace("22ms", "").replace(/\d+(\.\d+)?s ease-in-out infinite/, "");
  assert.ok(!/\d+m?s\b/.test(left), `editor.css:${line} types a time: ${text.trim()}`);
  assert.ok(!/cubic-bezier|(^|[\s,])(ease|ease-out|ease-in|linear)([\s,;]|$)/.test(left), `editor.css:${line} types a curve: ${text.trim()}`);
}

// The overshoot curve (--ease-drop) only settles a shortcut dropped on the toolbar and ripples the others.
const bare = css.replace(/\/\*[\s\S]*?\*\//g, "");
const rules = [...bare.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => m[2].includes("--ease-drop")).map((m) => m[1].trim().replace(/\s+/g, " "));
assert.deepEqual(rules, [".tool.landed .glyph", ".palette.rippling .slot .glyph, .palette.rippling .tool:not(.landed) .glyph"]);

// Every overlay that leaves through Exit (motion.tsx) has an exit motion.
for (const overlay of ["strip", "library", "size-menu", "page-menu", "properties", "spectrum", "coach", "name-field", "name-suggestion", "name-history"])
  assert.ok(new RegExp(`:is\\([^)]*\\.${overlay}(?=[,)])[^)]*\\)\\.leaving`).test(css), `.${overlay}.leaving`);
assert.match(css, /\.modal-backdrop\.leaving > \*/);
console.log("motion.check: ok");
