// Run: node src/export.check.ts. Fails loudly if Octet's own marks on the canvas get into an exported or copied
// picture.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { UI } from "./export.ts";

// Export, Copy and Print take the canvas, less the layers UI names. An aria-hidden element on the canvas is one of
// Octet's own (the page, the selection's frame and handles, pen points, reaction interpretation and the rest), so it
// has a class in UI.
const editor = readFileSync(new URL("Editor.tsx", import.meta.url), "utf8"), ui = new Set(UI.split(",").map((c) => c.slice(1)));
const hidden = editor.split("\n").filter((l) => /<(g|path|rect|circle|line|text|polygon|polyline)\b[^>]*\baria-hidden\b/.test(l));
assert.ok(hidden.length >= 10, `found only ${hidden.length} of Octet's own layers; update this check`);
for (const l of hidden) {
  const c = /<(?:g|path|rect|circle|line|text|polygon|polyline)\b[^>]*?className="([^"]+)"/.exec(l)?.[1];
  assert.ok(c?.split(" ").some((x) => ui.has(x)), `not in UI, so it shows in exported pictures: ${l.trim().slice(0, 100)}`);
}
console.log("export.check: ok");
