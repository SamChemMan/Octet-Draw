// Run: node src/dragspeed.check.ts. Fails when a pointer move of a drag does work that does not move (issue #37).
// When a structure or a selection box is dragged, each pointer move draws the editor once. Before 1.2 it also drew a
// second time (the scroll bars, the centre mark and the grid pick set state that did not change), made the browser lay
// out the page for the pills when there were none, and built the key map again for each button of the Actions panel.
// A box or lasso also made new selection sets on each move, when it took in nothing new, so the Actions panel and all
// else that follows the selection worked again. A structure drag found each reagent table's reaction twice on each
// move (for the tables, and again for the tables that go with the drag). The reagent tables and the Actions panel
// still work again on each move of a structure drag, so they follow it as before.
// Measured in headless Chrome (production build, Sam's bench ~/octet-research/tools/perf with DIST and the drag_cpu,
// box_cpu, *_same and cap_panel scenarios, 17 November 2026, Apple silicon), the median JavaScript time of one pointer
// move, before and after. heavy.json with a reagent table on each reaction arrow (heavygrid.json): Select All and drag
// 188 and 124 ms, one structure 156 and 93 ms, a selection box 9.8 and 4.6 ms. heavy.json: Select All and drag 31 and
// 29 ms (no change), a selection box 9.0 and 4.3 ms. clean.json: a box 6.2 and 3.7 ms. React commits for each move:
// 1.6 before, 1.05 after. The canvas, the Actions panel and the scroll bars were the same before and after at moves 5,
// 30 and 60 and after the drop, and so was the Actions panel after each move of a caption dragged past a ring.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sameSet } from "./store.ts";

const source = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");
const editor = source("Editor.tsx"), scrollbars = source("Scrollbars.tsx"), pills = source("PanelControls.tsx");

// The names a memo depends on, in any order.
const deps = (name: string) => {
  const at = editor.indexOf(`const ${name} = useMemo(`);
  assert.ok(at >= 0, `${name} is a memo`);
  return new Set(/\[([^[\]]*)\]\);/.exec(editor.slice(at))![1].split(",").map((x) => x.trim()));
};
const has = (name: string, ...want: string[]) => want.forEach((x) => assert.ok(deps(name).has(x), `${name} depends on ${x}`));
// The reagent tables follow each move of a drag: their memo still depends on what is drawn (drawing, placed).
has("gridViews", "doc", "drawing", "placed");
// The Actions panel follows each move of a drag too (Tie to structure for a caption dragged under a ring): it depends
// on what is drawn. A box that keeps the selection's sets can still change the side arrow or step it picks.
has("panelContext", "drawing", "placed", "gridViews", "branchPick", "stepPick");
// Each arrow's reaction is found once for each drawing as drawn: the reagent tables, the tables that go with a drag
// and the Actions panel share it. A drag on a page with a reagent table on each reaction spent about half of each move
// finding the same reactions twice.
has("reactionsFound", "doc", "arrows", "drawing", "placed");
assert.match(editor, /const reactionOf = \(arrowId: number\) => \{ if \(!reactionsFound\.has\(arrowId\)\) reactionsFound\.set\(arrowId, findReaction\(doc, arrowId, arrows, inkBox, captionBox\)\); return reactionsFound\.get\(arrowId\); \};/);
assert.match(editor, /reaction: \(id\) => \(exporting \? findReaction\(m, id, arrows, inkBox, captionBox\) : reactionOf\(id\)\)/);
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
