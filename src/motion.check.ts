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
const overlays = ["strip", "library", "size-menu", "page-menu", "properties", "spectrum", "coach", "name-field", "name-suggestion", "name-history"];
for (const overlay of overlays)
  assert.ok(new RegExp(`:is\\([^)]*\\.${overlay}(?=[,)])[^)]*\\)\\.leaving`).test(css), `.${overlay}.leaving`);
assert.match(css, /\.modal-backdrop\.leaving > \*/);
// A rule that gives an overlay its own way in with two or more classes (.page-menu.above) outranks the exit rule, so
// the exit rule names that case too. Rules for reduced motion do not count: there the overlay goes at once.
let full = bare;
for (let i; (i = full.indexOf("@media (prefers-reduced-motion: reduce)")) >= 0; ) {
  let j = full.indexOf("{", i), depth = 0;
  for (; j < full.length; j++) if (full[j] === "{") depth++; else if (full[j] === "}" && --depth === 0) break;
  full = full.slice(0, i) + full.slice(j + 1);
}
const exit = /([^{}]+)\{[^{}]*animation: leave /.exec(bare)![1];
for (const m of full.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
  if (!/animation(-name)?:/.test(m[2])) continue;
  for (const sel of m[1].split(",").map((s) => s.trim().replace(/\s+/g, " "))) {
    const last = sel.split(/[ >+~]+/).pop()!;
    if (overlays.some((o) => last.startsWith(`.${o}`) && !/^[\w-]/.test(last.slice(o.length + 1))) && (sel.match(/\.[\w-]+/g) ?? []).length > 1 && !sel.includes(".leaving"))
      assert.ok(exit.includes(`${sel}.leaving`), `${sel} sets its own animation, so the exit rule needs ${sel}.leaving`);
  }
}
console.log("motion.check: ok");
