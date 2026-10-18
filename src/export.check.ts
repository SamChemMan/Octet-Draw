// Run: node src/export.check.ts. Fails loudly if Octet's own marks on the canvas get into an exported or copied
// picture.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { UI } from "./export.ts";

// Export, Copy and Print take the canvas, less the layers UI names. The selection's frame, its resize handles, its
// rotation handle and its centre are Octet's own: a picture of a selection never shows them.
const editor = readFileSync(new URL("Editor.tsx", import.meta.url), "utf8"), ui = new Set(UI.split(","));
const start = editor.indexOf("// The selection's frame with its resize handles and rotation handle");
assert.ok(start > 0, "found the selection's frame in Editor.tsx; update this check");
const frame = editor.slice(start, editor.indexOf("})()}", start));
const classes = new Set([...frame.matchAll(/className=(?:"([\w-]+)|\{[^}]*?"([\w-]+)[ "])/g)].map((m) => m[1] ?? m[2]));
assert.ok(classes.size >= 4, `found only ${[...classes].join(", ")}; update this check`);
for (const c of classes) assert.ok(ui.has(`.${c}`), `.${c} is drawn on the canvas but is not in UI, so it shows in exported pictures`);
console.log("export.check: ok");
