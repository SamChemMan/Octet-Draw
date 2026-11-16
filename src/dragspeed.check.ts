// Run: node src/dragspeed.check.ts. Fails when a pointer move of a drag does work that does not move (issue #37).
// When a structure or a selection box is dragged, each pointer move draws the editor once. Before 1.2 it also worked
// out the reagent tables and the Actions panel again, drew a second time (the scroll bars, the centre mark and the
// grid pick set state that did not change), made the browser lay out the page for the pills when there were none, and
// built the key map again for each button of the Actions panel.
// Measured in headless Chrome (production build, Sam's bench, 16 November 2026, Apple silicon), the median JavaScript
// time of one pointer move. Select All and drag on heavy.json: 30.8 ms before, 22.4 ms after (134 and 97 ms with a 4x
// CPU slow-down); on clean.json: 8.8 ms before, 6.5 ms after. A selection box on heavy.json: 7.9 ms before, 5.8 ms
// after (38 and 29 ms with the slow-down); on clean.json: 6.4 ms before, 4.1 ms after. React commits for each move:
// 1.5 before, 1.0 after.
// This checks the code that makes those moves cheap, and that the one new step of a box move (sameSet) stays cheap.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sameSet } from "./store.ts";

const source = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");
const editor = source("Editor.tsx"), scrollbars = source("Scrollbars.tsx"), pills = source("PanelControls.tsx");

// The reagent tables hold while a drag changes what is drawn, so the Actions panel (which reads them) holds too.
assert.match(editor, /const dragHeld = !!drag && shown !== doc;/);
assert.match(editor, /\}\) : \[\]; \}, \[loaded, namesLoaded, doc, !dragHeld && drawing, !dragHeld && placed, exporting, expPage\]\);/);
// A box or lasso move that takes in nothing new keeps the selection's sets, so nothing that follows them works again.
assert.match(editor, /setSelection\(\(s\) => \(keep && sameSet\(s, a\) \? s : a\)\);\n\s+setPicked\(\(s\) => \(keep && sameSet\(s, i\) \? s : i\)\);/);
assert.match(editor, /\[lo\[0\], hi\[1\]\]\]\)\], within, drag\.moved\);/);
assert.match(editor, /\(q\) => inPolygon\(q, points\), drag\.moved\);/);
// The Properties panel still waits until the pointer stops, whether or not the move changed the selection.
assert.match(editor, /\}, \[sweep, selection, drag\]\);/);
// State set from an effect only when it changes: a set to the same value draws the editor a second time.
assert.match(editor, /useEffect\(\(\) => \{ if \(pivot\) setPivot\(undefined\); \}, \[selection, picked\]\);/);
assert.match(editor, /useEffect\(\(\) => \{ if \(gridPick && \(selection\.size \|\| picked\.size\)\) setGridPick\(undefined\); \}, \[selection, picked\]\);/);
assert.match(scrollbars, /if \(has\[0\] !== !!now\[0\]\.b \|\| has\[1\] !== !!now\[1\]\.b\) setHas\(/);
assert.doesNotMatch(scrollbars, /setHas\(\(h\)/);
// The pills measure the page only when there is a pill to place.
assert.match(pills, /if \(!el \|\| !pills\?\.length\) return;\n\s+const room = el\.getBoundingClientRect\(\)/);
// The key map is made once for each change in Settings, never in hint (once for each button, each time).
assert.match(editor, /const userKeys = useMemo\(\(\) => keymap\(settings\.keys\), \[settings\.keys\]\);/);
const hint = editor.slice(editor.indexOf("  const hint = (command: string) => {"), editor.indexOf("\n  };\n", editor.indexOf("  const hint = (command: string) => {")));
assert.ok(hint.length > 100 && !hint.includes("keymap("), "hint uses userKeys");

// sameSet: the same things in any order; a different size or one thing different is not the same.
assert.ok(sameSet(new Set([1, 2, 3]), new Set([3, 1, 2])));
assert.ok(sameSet(new Set<number>(), new Set<number>()));
assert.ok(!sameSet(new Set([1, 2]), new Set([1, 2, 3])));
assert.ok(!sameSet(new Set([1, 2, 4]), new Set([1, 2, 3])));
// Its time on a selection of 2000 atoms (a large page selected whole): under 0.5 ms (about 0.04 ms on Sam's Mac),
// small next to the editor's draw it saves. The best of 3 batches, each of at least 15 ms.
const a = new Set(Array.from({ length: 2000 }, (_, i) => i)), b = new Set([...a].reverse());
let best = Infinity;
for (let k = 0; k < 3; k++) {
  let n = 0;
  const t0 = performance.now();
  do { sameSet(a, b); n++; } while (performance.now() - t0 < 15);
  best = Math.min(best, (performance.now() - t0) / n);
}
assert.ok(best < 0.5, `sameSet takes ${best.toFixed(3)} ms on 2000 atoms`);
console.log(`dragspeed: ok (sameSet ${best.toFixed(3)} ms on 2000 atoms)`);
