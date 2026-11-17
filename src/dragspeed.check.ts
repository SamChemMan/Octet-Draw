// Run: node src/dragspeed.check.ts. Fails when a pointer move of a drag does work that does not move (issue #37).
// When a structure or a selection box is dragged, each pointer move draws the editor once. Before 1.2 it also drew a
// second time (the scroll bars, the centre mark and the grid pick set state that did not change), made the browser lay
// out the page for the pills when there were none, and built the key map again for each button of the Actions panel.
// A box or lasso also made new selection sets on each move, when it took in nothing new, so the Actions panel and all
// else that follows the selection worked again. The reagent tables and the Actions panel still work again on each move
// of a structure drag, so they follow it as before (a table under a dragged structure, Tie to structure for a caption).
// Measured in headless Chrome (production build, Sam's bench with the drag_cpu, box_cpu and cap_panel scenarios,
// 17 November 2026, Apple silicon), the median JavaScript time of one pointer move, before and after. heavy.json:
// Select All and drag 28.9 and 28.3 ms, a selection box 8.0 and 5.6 ms. clean.json: a box 6.3 and 3.7 ms. heavy.json
// with a reagent table on each reaction arrow: a drag 179 and 177 ms, a box 8.6 and 7.1 ms. React commits for each
// move: 1.6 before, 1.05 after. The canvas, the Actions panel and the scroll bars were the same before and after at
// moves 5, 30 and 60 and after the drop, and so was the Actions panel after each move of a caption dragged past a ring.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sameSet } from "./store.ts";
import { gridViews, type GridDeps } from "./gridview.ts";
import type { Mol } from "./render.ts";

const source = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");
const editor = source("Editor.tsx"), scrollbars = source("Scrollbars.tsx"), pills = source("PanelControls.tsx");

// The reagent tables follow each move of a drag: their memo still depends on what is drawn (drawing, placed).
assert.match(editor, /\}\) : \[\]; \}, \[loaded, namesLoaded, doc, drawing, placed, exporting, expPage\]\);/);
// The list of tables is new each time, also with no table: the Actions panel depends on it, and so it follows a drag.
const none = {} as GridDeps, page = (n: number): Mol => ({ atoms: Array.from({ length: n }, (_, i) => ({ label: "C", location: [i, 0, 0] })), bonds: [] }) as unknown as Mol;
assert.notEqual(gridViews(page(3), none), gridViews(page(3), none));
// A box that keeps the selection's sets can still change the side arrow or step it picks: the Actions panel follows.
assert.match(editor, /const panelContext = useMemo\([^\n]*, gridViews, [^\n]*\bbranchPick, stepPick\]\);/);
// A box or lasso move that takes in nothing new keeps the selection's sets, so nothing that follows them works again.
assert.match(editor, /setSelection\(\(s\) => \(keep && sameSet\(s, a\) \? s : a\)\);\n\s+setPicked\(\(s\) => \(keep && sameSet\(s, i\) \? s : i\)\);/);
assert.match(editor, /\[lo\[0\], hi\[1\]\]\]\)\], within, drag\.moved\);/);
assert.match(editor, /\(q\) => inPolygon\(q, points\), drag\.moved\);/);
// The Properties panel still waits until the pointer stops, whether or not the move changed the selection.
assert.match(editor, /\}, \[sweep, selection, drag\]\);/);
// State set from an effect only when it changes: a set to the same value draws the editor a second time.
assert.match(editor, /useEffect\(\(\) => \{ if \(pivot\) setPivot\(undefined\); \}, \[selection, picked\]\);/);
assert.match(editor, /useEffect\(\(\) => \{ if \(gridPick && \(selection\.size \|\| picked\.size\)\) setGridPick\(undefined\); \}, \[selection, picked\]\);/);
assert.match(scrollbars, /if \(hasNow\.current\[0\] !== next\[0\] \|\| hasNow\.current\[1\] !== next\[1\]\) setHas\(\(hasNow\.current = next\)\);/);
assert.doesNotMatch(scrollbars, /setHas\(\(h\)/);
// The pills measure the page only when there is a pill to place.
assert.match(pills, /if \(!el \|\| !free\?\.length\) return;\n\s+const room = el\.getBoundingClientRect\(\)/);
// The key map is made once for each change in Settings, never in hint (once for each button, each time).
assert.match(editor, /const userKeys = useMemo\(\(\) => keymap\(settings\.keys\), \[settings\.keys\]\);/);
const hint = editor.slice(editor.indexOf("  const hint = (command: string) => {"), editor.indexOf("\n  };\n", editor.indexOf("  const hint = (command: string) => {")));
assert.ok(hint.length > 100 && !hint.includes("keymap("), "hint uses userKeys");

// sameSet: the same things in the same order; another order, a different size or one thing different is not the same.
assert.ok(sameSet(new Set([1, 2, 3]), new Set([1, 2, 3])));
assert.ok(!sameSet(new Set([1, 2, 3]), new Set([3, 1, 2])));
assert.ok(sameSet(new Set<number>(), new Set<number>()));
assert.ok(!sameSet(new Set([1, 2]), new Set([1, 2, 3])));
assert.ok(!sameSet(new Set([1, 2, 4]), new Set([1, 2, 3])));
// Its time on a selection of 2000 atoms (a large page selected whole): under 0.5 ms (about 0.04 ms on Sam's Mac),
// small next to the editor's draw it saves. The best of 3 batches, each of at least 15 ms.
const a = new Set(Array.from({ length: 2000 }, (_, i) => i)), b = new Set(a);
let best = Infinity;
for (let k = 0; k < 3; k++) {
  let n = 0;
  const t0 = performance.now();
  do { sameSet(a, b); n++; } while (performance.now() - t0 < 15);
  best = Math.min(best, (performance.now() - t0) / n);
}
assert.ok(best < 0.5, `sameSet takes ${best.toFixed(3)} ms on 2000 atoms`);

console.log(`dragspeed: ok (sameSet ${best.toFixed(3)} ms on 2000 atoms)`);
