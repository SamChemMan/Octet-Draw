// Run: node src/word.check.ts. Word on the Mac (src-tauri/src/word.rs). A double-click on a structure in Word opens
// it in Octet unless the user turns the setting off, a double-click in Word never shows an alert, and Edit Picture
// from Word opens no second window on a picture. Only a Mac compiles word.rs, so this reads its source; its own tests
// are beside it.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const settings = read("settings.ts"), rs = read("../src-tauri/src/word.rs"), editor = read("Editor.tsx");
const body = (start: string) => { const i = rs.indexOf(start); assert.ok(i >= 0, `found ${start}; update this check`); return rs.slice(i, rs.indexOf("\n}\n", i)); };

// Settings > General > Word > Double-click opens a structure in Octet is on for a new user and for a user who updates
// (Sam, 19 November 2026): only a false the user set with the switch (wordChosen) turns it off, as 1.1.2 saved the old
// default, off, in every copy. Off, Octet installs no mouse monitor and sends Word no Apple Event.
assert.match(settings, /\nconst DEFAULTS: Settings = \{[^\n]*\bwordClick: true, wordChosen: false,/, "on for a new user");
const load = /\n {6}wordClick: ([^\n]+?), wordChosen: ([^\n]+),\n/.exec(settings);
assert.ok(load, "found how wordClick loads; update this check");
const wordClick = new Function("saved", `return ${load[1]};`) as (saved: object) => unknown;
assert.equal(wordClick({}), true, "settings saved before this setting was there");
assert.equal(wordClick({ wordClick: false }), true, "1.1.2's saved default does not count");
assert.equal(wordClick({ wordClick: false, wordChosen: true }), false, "the user turned it off");
assert.equal(wordClick({ wordClick: true, wordChosen: true }), true);
assert.equal(wordClick({ wordClick: "false", wordChosen: true }), true, "only a boolean false turns it off");
assert.equal(wordClick({ wordClick: false, wordChosen: "true" }), true, "only a boolean true counts as chosen");
assert.match(editor, /onWordClick=\{\(wordClick\) => setSettings\(\(s\) => \(\{ \.\.\.s, wordClick, wordChosen: true \}\)\)\}/, "the switch marks it chosen");

// A double-click in Word is not a command to Octet: when the user did not allow Octet to control Word, it shows no
// alert. File > Edit Picture from Word and Update show it.
assert.doesNotMatch(body("fn double_click("), /tell\(|Fail::Denied/, "a refused double-click shows nothing");
assert.match(body("pub fn edit("), /Err\(f\) => tell\(&app, &f, None\)/, "Edit Picture from Word says why");

// Edit Picture from Word looks for an object window that has the picture open before it reads the picture, and brings
// that window to the front.
const find = body("fn find(");
assert.ok(find.indexOf("run(PICKED, &marks)") >= 0 && find.indexOf("run(PICKED, &marks)") < find.indexOf("read(true)"), "the open windows first");
assert.match(body("pub fn edit("), /find\(&marks\)[^]*Pick::Front\(mark\)\)\) => crate::objects::front_word\(&app, &mark\)/);

// The scripts are ASCII, so they do not depend on how osascript reads its input.
const scripts = [...rs.matchAll(/const ([A-Z]+): &str = r#"([^]*?)"#;/g)];
assert.deepEqual(scripts.map((s) => s[1]), ["EDIT", "MARK", "UPDATE", "BACK", "PICKED"], "found the scripts; update this check");
for (const [, name, text] of scripts) assert.match(text, /^[\x00-\x7f]*$/, `${name} is ASCII`);

// The program is Word in the Settings group and in the macOS prompt, as in File > Edit Picture from Word and Update
// in Word.
assert.match(read("SettingsWindow.tsx"), /d\("general", "Word", "Double-click opens a structure in Octet",/);
assert.match(read("../src-tauri/Info.plist"), /<string>Octet Draw reads the drawing that you select in Word and puts your changes back\.<\/string>/);

console.log("word: ok");
