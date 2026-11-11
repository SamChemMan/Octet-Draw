// Run: node src/insertfile.check.ts. Fails loudly if File > Insert… (issues 72 and 106) stops putting a drawing or a
// picture into the open drawing as a dropped file goes in: one step to undo, selected, and clear of what is there.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bounds, extent, fitSizes, stack } from "./edit.ts";
import { menuRuns } from "./keys.ts";
import { pictureMol } from "./picture.ts";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const editor = read("Editor.tsx"), main = read("../src-tauri/src/main.rs"), open = read("../src-tauri/src/open.rs");
const body = (text: string, start: string, end: string) => { const i = text.indexOf(start); assert.ok(i >= 0, `found ${start}; update this check`); return text.slice(i, text.indexOf(end, i)); };

// File > Insert…, after Import a Structure…. Home has no drawing, so it does not run there.
assert.match(main, /&item\("import", "Import a Structure…", ""\)\?,\n\s*&item\("insert_file", "Insert…", ""\)\?,/);
assert.match(main, /\bopen::insert_file,/, "insert_file is a command");
assert.equal(menuRuns("insert_file", { home: true, modal: false, typing: false }), false);
assert.equal(menuRuns("insert_file", { home: false, modal: false, typing: false }), true);
assert.match(editor, /insert_file: \["Insert a drawing or picture…", "", <FileImage size=\{18\} \/>\]/, "the command palette has it");

// The dialog offers drawings and pictures (a PDF or an EMF for the drawing in it). The file is read as a dropped one
// is, with Open's limits, and is not remembered for Save or put on Home's list.
const command = body(open, "pub async fn insert_file(", "\n}");
assert.match(command, /add_filter\("Drawings and pictures", &\[&DRAWINGS\[\.\.\], &PICTURES, &VECTORS\]\.concat\(\)\)/);
assert.match(command, /opened_picture\(&path, &name, &ext, false\)/);
assert.match(command, /match read\(&path, &name\)/);
assert.match(command, /OpenedFile \{ name, path: None, text, picture, error, at: None \}/);
assert.ok(!/stamp|recent::note|picked/.test(command), "an inserted file is not the drawing's own file");

// The page puts it in through dropFiles with no point: it lands clear of what is there, as an import does, and joins
// no cycle it was not aimed at. Dropped, it is centred on the drop point as before. Either way, one undo step and
// selected, and a drawing's text keeps its proportion to this drawing's, as in a paste.
assert.match(body(editor, "  async function insertFile(", "\n  }\n"), /invoke<OpenedFile \| null>\("insert_file"\);\n\s*if \(f\?\.error\) setNotice\(f\.error\);\n\s*else if \(f\) await dropFiles\(\[f\]\);/);
const drop = body(editor, "  async function dropFiles(", "\n  }\n");
assert.match(drop, /at = files\[0\]\.at && toDoc\(\.\.\.files\[0\]\.at\)/);
assert.match(drop, /insertMol\(now\.current, add, at \? \[at\[0\] - \(b\[0\] \+ b\[2\]\) \/ 2, at\[1\] - \(b\[1\] \+ b\[3\]\) \/ 2\] : landing\(add\)\);\n\s*set\(r\.mol, true, undefined, at \? "placed" : true\);/);
assert.match(drop, /revealNext\.current = true;\n\s*setSelection\(r\.atoms\);\n\s*setPicked\(r\.items\);/);
assert.match(drop, /mols\.push\(\{ \.\.\.\(r\.mol\.style \? fitSizes\(r\.mol, r\.mol\.style, style\) : r\.mol\), style: undefined \}\);/);
assert.equal((editor.match(/await dropFiles\(/g) ?? []).length, 2, "drops and File > Insert… share dropFiles");

// A picture alone has no atoms, so where it lands goes by its own box.
assert.match(body(editor, "  function landing(", "\n  }\n"), /const f = bounds\(frag\) \?\? extent\(frag\)!/);
const picture = stack([pictureMol({ PNG: "89504E47" }, 144, 72, 14.4)]);
assert.equal(bounds(picture), undefined);
assert.deepEqual(extent(picture), [-5, -2.5, 5, 2.5], "1 pt per pixel: 144 by 72 px is 10 by 5 bond lengths of 14.4 pt");

// A drawing with 30 pt bonds and a 24 pt caption, put into one with 14.4 pt bonds: its text keeps its proportion.
const from = { bond: 30, labelSize: 10, captionSize: 12 }, to = { bond: 14.4, labelSize: 10, captionSize: 12 };
const fitted = fitSizes({ atoms: [], bonds: [], captions: [{ id: 1, x: 0, y: 0, text: "a", size: 24 }] }, from, to);
assert.equal(fitted.captions![0].size, 11.52);

console.log("insertfile.check: ok");
