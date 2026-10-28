// Run: node src/projects.check.ts. Fails loudly if Home's projects store loses or mixes up a project, keeps a drawing
// twice, takes a drawing with a project that goes, leaves a thumbnail file behind, reads a damaged or newer store as
// anything but empty, or takes a picture for a thumbnail that is too large; or if Home's sections or keys change.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  addDrawings, cleanName, createProject, deleteProject, drawingName, emptyStore, forget, freeName, MAX_IN_PROJECT, MAX_NAME, MAX_PROJECTS, mosaic,
  projectOf, projectsWith, readStore, relocate, removeDrawing, renameProject, resetPicture, setPicture, setProjectThumb, STORE_VERSION, thumbIds,
  UNTITLED, writeStore, type HomeStore,
} from "./projects.ts";
import { cover, inputProblem, INPUT_TOO_LARGE, MAX_INPUT, sizeProblem, THUMB_H, THUMB_W } from "./thumbs.ts";
import { NOT_PICTURE, TOO_MANY_PIXELS } from "./picture.ts";
import { tileTo } from "./keys.ts";

const T1 = "0123456789abcdef", T2 = "fedcba9876543210", T3 = "00000000000000aa", T4 = "00000000000000bb";
const A = "/Users/sam/Thesis/aspirin.oct", B = "/Users/sam/Thesis/scheme 1.cdxml", C = "C:\\Users\\sam\\cycle.cdx";

// ——— Create and rename ———
let s: HomeStore = emptyStore();
s = createProject(s, "  Thesis\tchapter 2 ", "p1", 100);
assert.deepEqual(s.projects, [{ id: "p1", name: "Thesis chapter 2", made: 100, drawings: [] }], "a name is tidied");
s = createProject(s, "", "p2", 101);
assert.equal(projectOf(s, "p2")!.name, UNTITLED, "no name: Untitled project");
s = createProject(s, "untitled PROJECT", "p3", 102);
assert.equal(projectOf(s, "p3")!.name, "untitled PROJECT 2", "a name another project has (letter case aside) takes the next number");
assert.equal(createProject(s, "Again", "p1", 103), s, "an id in use makes nothing");
assert.deepEqual(s.projects.map((p) => p.id), ["p1", "p2", "p3"], "new projects go after the others");
assert.equal(freeName(s, "x".repeat(200)).length, MAX_NAME);
assert.equal(cleanName("a\u0000b\nc"), "a b c");
s = renameProject(s, "p2", "Group meeting");
assert.equal(projectOf(s, "p2")!.name, "Group meeting");
assert.equal(renameProject(s, "p2", "   "), s, "an empty name changes nothing");
assert.equal(renameProject(s, "p2", "Group meeting"), s, "the same name changes nothing");
assert.equal(projectOf(renameProject(s, "p3", "thesis chapter 2"), "p3")!.name, "thesis chapter 2 2", "a name another project has takes the next number");
assert.equal(renameProject(s, "nope", "x"), s);
let many = emptyStore();
for (let k = 0; k < MAX_PROJECTS + 5; k++) many = createProject(many, `P${k}`, `m${k}`, k);
assert.equal(many.projects.length, MAX_PROJECTS, "projects stop at the most Octet keeps");

// ——— Add and remove drawings ———
let r = addDrawings(s, "p1", [{ path: A }, { path: B, name: "Scheme 1" }, { path: A }], 200);
assert.equal(r.added, 2, "a drawing goes in once");
s = r.store;
assert.deepEqual(projectOf(s, "p1")!.drawings, [{ path: A, name: "aspirin", added: 200 }, { path: B, name: "Scheme 1", added: 200 }]);
r = addDrawings(s, "p1", [{ path: A }], 201);
assert.equal(r.added, 0);
assert.equal(r.store, s, "a drawing in the project already changes nothing");
s = addDrawings(s, "p2", [{ path: A }, { path: C }], 202).store;
assert.deepEqual(projectsWith(s, A).map((p) => p.id), ["p1", "p2"], "a drawing can be in more than one project");
assert.equal(drawingName(C), "cycle");
assert.equal(addDrawings(s, "p1", [{ path: "" }, { path: "x".repeat(5000) }], 1).added, 0, "no empty or overlong paths");
assert.equal(addDrawings(s, "nope", [{ path: A }], 1).added, 0);
const full = addDrawings(emptyStore(), "x", [], 0);
assert.equal(full.added, 0);
let big = createProject(emptyStore(), "Big", "big", 0);
big = addDrawings(big, "big", Array.from({ length: MAX_IN_PROJECT + 10 }, (_, k) => ({ path: `/d/${k}.oct` })), 0).store;
assert.equal(projectOf(big, "big")!.drawings.length, MAX_IN_PROJECT, "a project stops at the most Octet keeps");

// Automatic pictures: a copy for each drawing in a project. Out of its last project, the copy goes.
s = setPicture(s, A, "auto", T1).store;
s = setPicture(s, C, "auto", T2).store;
let d = removeDrawing(s, "p1", A);
assert.deepEqual(d.drop, [], "still in Group meeting: the picture stays");
assert.equal(d.store.pictures[A].auto, T1);
d = removeDrawing(d.store, "p2", A);
assert.deepEqual(d.drop, [T1], "in no project: its picture goes");
assert.equal(d.store.pictures[A], undefined);
assert.deepEqual(projectOf(d.store, "p1")!.drawings.map((x) => x.path), [B], "the other drawings stay");

// Delete a project: no drawing goes with it, only thumbnails nothing else uses.
s = setProjectThumb(s, "p2", T3).store;
const del = deleteProject(s, "p2");
assert.deepEqual(del.store.projects.map((p) => p.id), ["p1", "p3"]);
assert.deepEqual(del.drop.sort(), [T2, T3].sort(), "its own thumbnail, and C's picture (in no other project); A is still in Thesis");
assert.equal(del.store.pictures[A].auto, T1);
assert.equal(del.store.pictures[C], undefined);
assert.deepEqual(deleteProject(s, "nope"), { store: s, drop: [] });

// ——— Missing files: Locate… moves a drawing in every project, with its thumbnails ———
const moved = "/Users/sam/Archive/aspirin.oct";
s = setPicture(s, A, "own", T4).store;
const loc = relocate(s, A, moved);
assert.ok(loc.store.projects.every((p) => !p.drawings.some((x) => x.path === A)));
assert.deepEqual(projectsWith(loc.store, moved).map((p) => p.id), ["p1", "p2"]);
assert.equal(projectOf(loc.store, "p1")!.drawings[0].path, moved, "it keeps its place in the project");
assert.deepEqual(loc.store.pictures[moved], { own: T4, auto: T1 });
assert.equal(loc.store.pictures[A], undefined);
assert.deepEqual(loc.drop, []);
// Located onto a drawing a project has already: that project keeps one entry.
const onto = relocate(s, A, B);
assert.deepEqual(projectOf(onto.store, "p1")!.drawings.map((x) => x.path), [B]);
assert.deepEqual(projectOf(onto.store, "p2")!.drawings.map((x) => x.path), [B, C]);
assert.equal(relocate(s, A, A).store, s);

// ——— Thumbnails: set, replace and reset ———
let t = setPicture(s, B, "own", T1);
assert.deepEqual(t.drop, []);
t = setPicture(t.store, B, "own", T2);
assert.deepEqual(t.drop, [T1], "a new thumbnail takes the old one's place, and the old file goes");
t = resetPicture(t.store, B);
assert.deepEqual(t.drop, [T2], "Use Automatic Thumbnail");
assert.equal(t.store.pictures[B], undefined);
assert.deepEqual(resetPicture(t.store, B), { store: t.store, drop: [] }, "no thumbnail of its own: nothing to reset");
assert.equal(setPicture(s, B, "own", "../../x").store, s, "a thumbnail is named by 16 hex digits only");
let pt = setProjectThumb(s, "p1", T1);
pt = setProjectThumb(pt.store, "p1", undefined);
assert.deepEqual(pt.drop, [T1], "a project's own thumbnail goes back to its mosaic");
assert.equal(projectOf(pt.store, "p1")!.thumb, undefined);
assert.deepEqual(new Set(thumbIds(setProjectThumb(s, "p1", T2).store)), new Set([T1, T2, T3, T4]), "every thumbnail the store uses, to load");
// Remove from Home: a drawing in no project takes its thumbnails with it.
const lone = setPicture(emptyStore(), "/d/lone.oct", "own", T3).store;
assert.deepEqual(forget(lone, "/d/lone.oct"), { store: { ...lone, pictures: {} }, drop: [T3] });
assert.deepEqual(forget(s, A).drop, [], "in a project: it keeps them");
// The mosaic: the first four drawings with a picture.
const four = addDrawings(createProject(emptyStore(), "M", "m", 0), "m", ["/a.oct", "/b.oct", "/c.oct", "/d.oct", "/e.oct", "/f.oct"].map((path) => ({ path })), 0).store;
assert.deepEqual(mosaic(projectOf(four, "m")!, (p) => (p === "/b.oct" ? undefined : p)), ["/a.oct", "/c.oct", "/d.oct", "/e.oct"]);

// ——— Reading and writing: version, damage ———
const text = writeStore(s);
assert.equal(JSON.parse(text).version, STORE_VERSION);
assert.deepEqual(readStore(text), { store: s }, "a store reads back as it was written");
assert.deepEqual(readStore(null), { store: emptyStore() }, "no file: no projects, and no notice");
assert.deepEqual(readStore(""), { store: emptyStore() });
for (const bad of ["{", "[]", "null", "42", '{"projects":[]}', '{"version":"1","projects":[]}', '{"version":1,"projects":{}}'])
  assert.deepEqual(readStore(bad), { store: emptyStore(), problem: "damaged" }, bad);
assert.deepEqual(readStore(JSON.stringify({ ...JSON.parse(text), version: STORE_VERSION + 1 })), { store: emptyStore(), problem: "newer" }, "a later Octet's store is not read");
// One bad entry loses only that entry.
const mixed = readStore(JSON.stringify({
  version: 1,
  projects: [
    { id: "ok", name: "Fine", made: 5, thumb: T1, drawings: [{ path: A, name: "aspirin", added: 1 }, { path: A }, { path: 7 }, "junk", { path: B }] },
    { id: "ok", name: "Same id", drawings: [] },
    { id: "../x", name: "Bad id", drawings: [] },
    { id: "blank", name: "   ", drawings: [] },
    { id: "nothumb", name: "No thumb", made: -4, thumb: "../../etc/passwd", drawings: "nope" },
    "junk",
  ],
  pictures: { [A]: { own: T2, auto: "x" }, [B]: { own: 5 }, [""]: { own: T3 }, [C]: "nope" },
  extra: true,
}));
assert.equal(mixed.problem, undefined);
assert.deepEqual(mixed.store.projects, [
  { id: "ok", name: "Fine", made: 5, thumb: T1, drawings: [{ path: A, name: "aspirin", added: 1 }, { path: B, name: "scheme 1", added: 0 }] },
  { id: "nothumb", name: "No thumb", made: 0, drawings: [] },
]);
assert.deepEqual(mixed.store.pictures, { [A]: { own: T2 } });

// ——— Thumbnail pictures: hostile files are refused before they are decoded ———
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
assert.equal(inputProblem(png), undefined);
assert.equal(inputProblem(new TextEncoder().encode("<svg onload=alert(1)>")), NOT_PICTURE, "by its bytes, never its name");
const huge = new Uint8Array(MAX_INPUT + 1);
huge.set(png);
assert.equal(inputProblem(huge), INPUT_TOO_LARGE);
assert.equal(sizeProblem(0, 10), NOT_PICTURE);
assert.equal(sizeProblem(20000, 10), TOO_MANY_PIXELS);
assert.equal(sizeProblem(8000, 8000), TOO_MANY_PIXELS, "64 million pixels");
assert.equal(sizeProblem(4032, 3024), undefined, "a phone photo");
// Cut to the tile's 4:3 from the middle.
assert.equal(THUMB_W / THUMB_H, 4 / 3);
assert.deepEqual(cover(4000, 3000), { sx: 0, sy: 0, sw: 4000, sh: 3000 });
assert.deepEqual(cover(1600, 900), { sx: 200, sy: 0, sw: 1200, sh: 900 }, "wide: its middle");
assert.deepEqual(cover(900, 1600), { sx: 0, sy: 462.5, sw: 900, sh: 675 }, "tall: its middle");

// ——— Home: its sections in order, each a landmark with its heading, and its keys ———
const home = readFileSync(new URL("./Home.tsx", import.meta.url), "utf8");
const order = [...home.matchAll(/<Section id="(\w+)"/g)].map((m) => m[1]);
assert.deepEqual(order, ["new", "templates", "recent", "projects", "project"], "New, Templates, Recent, then Projects; an open project in their place");
assert.match(home, /<Section id="projects" title="Projects">/);
assert.match(home, /<section className=\{?["`]home-section/, "each section is a <section>");
assert.match(home, /aria-labelledby=\{`\$\{id\}-title`\}/, "named by its heading, so screen readers list it as a region");
assert.match(home, /e\.key === "Enter" && at < 0/, "Return starts Quick start (decision 0003)");
assert.match(home, /roving/, "one Tab stop for each section");
assert.ok(!/<Menu\b|className="strip|role="menu"/.test(home.replace(/import[^;]+;/g, "")), "Home's menus are ContextMenu (src/Menu.tsx), not menus of its own");
assert.match(home, /ContextMenu/);
// The arrow keys move between tiles across sections: the New row, then a section of four wide tiles under it.
const rect = (x: number, y: number, w = 150, h = 140) => ({ x, y, width: w, height: h });
const tiles = [rect(0, 0), rect(200, 0), rect(350, 0), rect(500, 0), rect(0, 300, 230, 200), rect(250, 300, 230, 200), rect(500, 300, 230, 200), rect(0, 600, 230, 200)];
assert.equal(tileTo("ArrowDown", 0, tiles), 4, "down from New into Recent");
assert.equal(tileTo("ArrowDown", 1, tiles), 5, "to the nearest tile in the row below");
assert.equal(tileTo("ArrowDown", 5, tiles), 7, "down from Recent into Projects");
assert.equal(tileTo("ArrowUp", 7, tiles), 4);
console.log("projects.check: ok");
