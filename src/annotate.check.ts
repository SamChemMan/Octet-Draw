// Run: node src/annotate.check.ts. Fails loudly if notes (issues 101 and 102, docs/plans/issue-101-102-notes.md) stop
// being cleaned and limited as the plan says (N1), stop going with their objects through every edit (N5), or start to
// cost a drawing that has none anything (withoutNotes gives back the same drawing).
import assert from "node:assert/strict";
import { allNotes, capNotes, cleanNote, MAX_ANNOTATIONS, MAX_CONTENT, MAX_NOTES, NOTE, noteCount, noteOf, noteTargets, withNote, withoutNotes } from "./annotate.ts";
import { alignFragments, deleteChosen, deleteGraphics, duplicateSelection, extractSelection, groupSelection, insertMol, tidyGroups, transformParts, ungroupSelection, updateArrow, updateShape } from "./edit.ts";
import { history, type History } from "./history.ts";
import type { Mol } from "./render.ts";

// A drawing with one of each kind of object that takes a note: text 1, arrow 2, box 3, cycle 4, a group 5 of the
// text and the box, and two atoms.
const base = (): Mol => ({
  atoms: [{ label: "C", location: [0, 0, 0] }, { label: "O", location: [1, 0, 0] }], bonds: [{ atoms: [0, 1], type: 1 }],
  captions: [{ id: 1, text: "1", x: 0, y: -1 }],
  arrows: [{ id: 2, kind: "reaction", from: [2, 0], to: [5, 0] }],
  shapes: [{ id: 3, kind: "box", from: [6, 1], to: [8, -1] }, { id: 6, kind: "tlc", from: [10, 2], to: [12, -2], tlc: { lanes: 2, spots: [{ lane: 0, rf: 0.5 }] } }],
  cycles: [{ id: 4, centre: [0, -6], radius: 2, clockwise: true, nodes: [], at: [0, 120, 240] }],
  groups: [{ id: 5, atoms: [], items: [1, 3] }],
  annotations: [{ keyword: "Title", content: "Route 2" }, { keyword: "GUID", content: "0A1B" }],
});

// N1: cleaning (issue 68's rule 3, and lone surrogates), and an empty note is no note (stress case 1).
{
  assert.equal(cleanNote("  \n \n a\tb\r\nc\u0000d\u007f\u0008\n\n  "), " a b\ncd");
  assert.equal(cleanNote("x\ry"), "x\ny");
  assert.equal(cleanNote("a\ud800b\udc00c😀"), "abc😀");
  assert.equal(cleanNote(" \n\t\n "), "");
  assert.equal(cleanNote("]]><annotation & \"'"), "]]><annotation & \"'");
  assert.equal(cleanNote("سلام\nZoë"), "سلام\nZoë");
  // 10,000 characters kept; more is cut, never into half a surrogate pair (stress case 2).
  assert.equal(cleanNote("x".repeat(MAX_CONTENT + 5)).length, MAX_CONTENT);
  assert.equal(cleanNote("x".repeat(MAX_CONTENT - 1) + "😀"), "x".repeat(MAX_CONTENT - 1));
  assert.equal(cleanNote("a".repeat(1_000_000)).length, MAX_CONTENT);
}

// N1: set, change, take off; one change for several targets; the same drawing when nothing changes.
{
  const m = base();
  assert.equal(withoutNotes(m), m, "no notes: the same drawing");
  assert.equal(withNote(m, [2], ""), m, "taking off a note there is not changes nothing");
  assert.equal(withNote(m, [99], "x"), m, "a target not in the drawing is left out");
  const a = withNote(m, [2], "\nA reference is needed.\n\n");
  assert.equal(noteOf(a, 2), "A reference is needed.");
  assert.deepEqual(a.arrows![0].notes, [{ keyword: NOTE, content: "A reference is needed." }]);
  assert.equal(a.captions, m.captions, "only the lists that change are new");
  assert.equal(withNote(a, [2], "A reference is needed."), a, "the same text changes nothing");
  const b = withNote(a, [2], "Two");
  assert.equal(noteOf(b, 2), "Two");
  assert.equal(b.arrows![0].notes!.length, 1);
  const c = withNote(b, [2], "   ");
  assert.equal(c.arrows![0].notes, undefined, "clearing takes it off");
  assert.equal("notes" in c.arrows![0], false);
  // The drawing's note sits after its other annotations, which stay.
  const d = withNote(m, ["drawing"], "For JACS");
  assert.deepEqual(d.annotations, [...m.annotations!, { keyword: NOTE, content: "For JACS" }]);
  assert.deepEqual(withNote(d, ["drawing"], "").annotations, m.annotations);
  // Several at once, groups too.
  const all = withNote(m, [1, 2, 3, 4, 5, 6], "Batch 7");
  for (const t of [1, 2, 3, 4, 5, 6]) assert.equal(noteOf(all, t), "Batch 7", `target ${t}`);
  assert.equal(noteCount(all), 6 + 2);
  // Other keywords from a ChemDraw file are notes too, under their keyword; the nth of a keyword is its own.
  const e: Mol = { ...m, captions: [{ ...m.captions![0], notes: [{ keyword: "Name", content: "A" }, { keyword: NOTE, content: "first" }, { keyword: NOTE, content: "second" }] }] };
  assert.equal(noteOf(withNote(e, [1], "B", "Name"), 1, "Name"), "B");
  assert.deepEqual(withNote(e, [1], "2nd", NOTE, 1).captions![0].notes!.map((x) => x.content), ["A", "first", "2nd"]);
  assert.equal(withNote(e, [1], "x", NOTE, 5), e, "no fifth note: nothing added");
}

// N1 limits (stress cases 4 and 29): 1000 on one target, 10,000 in a drawing; the check comes before anything changes.
{
  const full: Mol = { ...base(), annotations: Array.from({ length: MAX_ANNOTATIONS }, (_, k) => ({ keyword: `K${k}`, content: "x" })) };
  assert.throws(() => withNote(full, ["drawing"], "one more"), /This drawing has 1000 annotations, the most Octet keeps\./);
  assert.doesNotThrow(() => withNote(full, ["drawing"], ""), "taking one off is always allowed");
  const shapes = Array.from({ length: 10 }, (_, k) => ({ id: 100 + k, kind: "box" as const, from: [k, 0] as [number, number], to: [k + 1, 1] as [number, number], notes: Array.from({ length: MAX_ANNOTATIONS }, () => ({ keyword: NOTE, content: "n" })) }));
  const many: Mol = { atoms: [], bonds: [], shapes, arrows: [{ id: 1, kind: "line", from: [0, 0], to: [1, 1] }] };
  assert.equal(noteCount(many), MAX_NOTES);
  assert.throws(() => withNote(many, [1], "one more"), /This drawing has 10,000 notes, the most Octet keeps\./);
  assert.throws(() => withNote(many, [100], "x", "Other"), /This object has 1000 annotations/);
  assert.equal(noteOf(withNote(many, [100], "changed"), 100), "changed", "changing one is no new note");
  // Over the limit (a paste into a full drawing): capNotes keeps the drawing's, then the first in order.
  assert.equal(capNotes(many), many, "within the limit: the same drawing");
  const over: Mol = { ...many, annotations: [{ keyword: NOTE, content: "mine" }], arrows: [{ ...many.arrows![0], notes: [{ keyword: NOTE, content: "late" }] }] };
  const capped = capNotes(over);
  assert.equal(noteCount(capped), MAX_NOTES);
  assert.equal(noteOf(capped, "drawing"), "mine");
  assert.equal(noteOf(capped, 1), "late", "texts and arrows come before shapes");
  assert.equal(capped.shapes![9].notes!.length, MAX_ANNOTATIONS - 2, "the last shape's last two go");
  // Two groups that cross become one: at most 1000 annotations on it.
  const crossing: Mol = { atoms: [], bonds: [], captions: [1, 2, 3].map((id) => ({ id, text: `${id}`, x: id, y: 0 })),
    groups: [{ id: 10, atoms: [], items: [1, 2], annotations: Array.from({ length: 800 }, () => ({ keyword: NOTE, content: "a" })) }, { id: 11, atoms: [], items: [2, 3], annotations: Array.from({ length: 800 }, () => ({ keyword: NOTE, content: "b" })) }] };
  assert.equal(tidyGroups(crossing).groups!.length, 1);
  assert.equal(tidyGroups(crossing).groups![0].annotations!.length, MAX_ANNOTATIONS);
}

// N1 targets: a group held whole is one target, objects picked in it are not; a picked plate (its spot or lane picked)
// is a target; atoms are none; a picked id not in the drawing is none.
{
  const m = base();
  assert.deepEqual(noteTargets(m, new Set(), new Set([1, 3])), [5]);
  assert.deepEqual(noteTargets(m, new Set(), new Set([1])), [1]);
  assert.deepEqual(noteTargets(m, new Set([0, 1]), new Set([2, 4, 6, 77])), [2, 4, 6]);
  assert.deepEqual(noteTargets(m, new Set([0]), new Set()), []);
  assert.deepEqual(noteTargets(m, new Set(), new Set()), []);
}

// N1 the panel's and the MCP's list: the drawing's first, then reading order (top row first, then left to right);
// keywords that are not notes are left out.
{
  let m = withNote(base(), ["drawing"], "Drawing note");
  m = withNote(m, [6], "plate");
  m = withNote(m, [4], "cycle");
  m = withNote(m, [2], "arrow");
  m = withNote(m, [5], "group");
  const rows = allNotes(m);
  assert.deepEqual(rows.map((r) => r.on), ["drawing", 6, 5, 2, 4]);
  assert.ok(!rows.some((r) => r.keyword === "Title" || r.keyword === "GUID"));
  assert.deepEqual(allNotes(base()), []);
}

// N1 withoutNotes: every note goes (drawing, groups, objects); Title and GUID stay; the result is kept.
{
  const m = withNote(withNote(base(), [1, 2, 3, 4, 5, 6], "n"), ["drawing"], "d");
  const bare = withoutNotes(m);
  assert.equal(withoutNotes(m), bare, "the same result each time");
  assert.equal(noteCount(bare), 2);
  assert.deepEqual(bare.annotations, base().annotations);
  assert.ok([...bare.captions!, ...bare.arrows!, ...bare.shapes!, ...bare.cycles!].every((x) => !("notes" in x)));
  assert.equal(bare.groups![0].annotations, undefined);
  assert.equal(withoutNotes(bare), bare);
}

// N5: notes go with every edit, on the same objects.
{
  const noted = withNote(withNote(base(), [1, 2, 3, 4, 6], "on it"), [5], "the group");
  const sameNotes = (m: Mol, ids: number[], why: string) => { for (const id of ids) assert.equal(noteOf(m, id), id === 5 ? "the group" : "on it", `${why}: ${id}`); };
  const items = new Set([1, 2, 3, 4, 6]), atoms = new Set([0, 1]);
  // Move, turn, flip and scale (transformParts is every one of them), and align.
  sameNotes(transformParts(noted, atoms, items, (q) => [q[0] + 1, q[1] - 2]), [1, 2, 3, 4, 6], "move");
  sameNotes(transformParts(noted, atoms, items, (q) => [-q[1], q[0]]), [1, 2, 3, 4, 6], "turn");
  sameNotes(transformParts(noted, atoms, items, (q) => [-q[0], q[1]], [1, 1], undefined, 1, "across"), [1, 2, 3, 4, 6], "flip");
  sameNotes(transformParts(noted, atoms, items, (q) => [2 * q[0], 2 * q[1]], [2, 2]), [1, 2, 3, 4, 6], "scale");
  sameNotes(alignFragments(noted, atoms, "row"), [1, 2, 3, 4, 5, 6], "align");
  // A change of kind or look keeps the note.
  assert.equal(noteOf(updateArrow(noted, 2, { kind: "equilibrium", style: "dashed" }), 2), "on it");
  assert.equal(noteOf(updateShape(noted, 3, { kind: "oval", colour: "#ff0000" }), 3), "on it");
  // Copy and paste, and Option-drag: the copies have the notes; paste never adds to the drawing's own (ChemDraw 23.1).
  const part = extractSelection(noted, atoms, new Set([1, 2, 3, 4, 6]));
  assert.equal(noteOf(part, 2), "on it");
  assert.equal(noteOf(part, 5), "the group");
  const pasted = insertMol(withNote(noted, ["drawing"], "mine"), { ...part, annotations: [{ keyword: NOTE, content: "theirs" }] }, [20, 0]);
  assert.equal(noteOf(pasted.mol, "drawing"), "mine");
  assert.equal(noteOf(pasted.mol, pasted.ids.get(2)!), "on it");
  assert.equal(noteOf(pasted.mol, pasted.ids.get(5)!), "the group");
  const dup = duplicateSelection(noted, atoms, new Set([2, 4]));
  assert.equal(noteOf(dup.mol, dup.ids.get(2)!), "on it");
  assert.equal(noteOf(dup.mol, dup.ids.get(4)!), "on it");
  // Group: the new group has no note; its members keep theirs. Ungroup takes the group's note with it.
  const [grouped, gid] = groupSelection(noted, new Set(), new Set([2, 4]))!;
  assert.equal(noteOf(grouped, gid), "");
  sameNotes(grouped, [2, 4], "group");
  const ungrouped = ungroupSelection(noted, new Set(), new Set([1, 3]));
  assert.equal(ungrouped.groups?.length ?? 0, 0);
  sameNotes(ungrouped, [1, 3], "ungroup");
  // Delete takes the note with its object; a group left with one thing goes, and its note (stress case 14).
  const gone = deleteGraphics(noted, new Set([2, 3]));
  assert.equal(noteOf(gone, 2), "");
  assert.equal(gone.groups?.length ?? 0, 0, "the group of one goes");
  assert.equal(noteCount(gone), noteCount(noted) - 3);
  assert.equal(noteOf(deleteChosen(noted, atoms, new Set([4])), 4), "");
  assert.equal(tidyGroups(noted), noted);
}

// N5 undo and redo (stress case 5): add, change, delete, then back three and forward three, each state exactly.
{
  const s0 = base(), s1 = withNote(s0, [2], "first"), s2 = withNote(s1, [2], "second"), s3 = deleteGraphics(s2, new Set([2]));
  let h: History = { stack: [s0], at: 0 };
  for (const m of [s1, s2, s3]) h = history(h, { type: "set", mol: m });
  const seen: Mol[] = [];
  for (let k = 0; k < 3; k++) { h = history(h, { type: "undo" }); seen.push(h.stack[h.at]); }
  for (let k = 0; k < 3; k++) { h = history(h, { type: "redo" }); seen.push(h.stack[h.at]); }
  assert.deepEqual(seen, [s2, s1, s0, s1, s2, s3]);
  assert.deepEqual([noteOf(s0, 2), noteOf(s1, 2), noteOf(s2, 2), noteOf(s3, 2)], ["", "first", "second", ""]);
}

console.log("annotate: all checks pass");
