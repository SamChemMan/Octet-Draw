// Run: node src/look.check.ts. Fails loudly if the app's look or words drift from the brand: British spelling, STE
// messages, Regular icons at the role sizes, the type scale, and the named colour lists.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { elementColours, HIGHLIGHTS } from "./docstyle.ts";

const src = new URL(".", import.meta.url);
const read = (name: string) => readFileSync(new URL(name, src), "utf8");
const tsx = readdirSync(src).filter((f) => f.endsWith(".tsx")).map((f) => [f, read(f)] as const);
const code = [...tsx, ...readdirSync(src).filter((f) => f.endsWith(".ts") && !f.endsWith(".check.ts") && !["cdxml.ts", "cdx.ts", "cdxtags.ts"].includes(f)).map((f) => [f, read(f)] as const), ["main.rs", read("../src-tauri/src/main.rs")] as const];
// The string literals in a file, without its comments.
const strings = (text: string) => text.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n").match(/"[^"\n]*"|`[^`\n]*`/g) ?? [];

// British English in every word a user reads (code identifiers keep standard spellings; cdxml.ts, cdx.ts and cdxtags.ts
// write ChemDraw's own attribute names and values, so they are left out).
for (const [file, text] of code) {
  for (const s of strings(text)) assert.ok(!/\b(Analyz|analyz|Color\b|Colors\b|Center\b|Gray\b|Favorite|Optimiz|Organiz)/.test(s), `${file}: US spelling in ${s}`);
}
// STE messages: "Select", never "Pick", for what to select first; "cannot", never a contraction.
for (const [file, text] of code) {
  for (const s of strings(text)) {
    assert.ok(!/\b(can't|couldn't|won't|doesn't|isn't|don't|didn't)\b/.test(s), `${file}: contraction in ${s}`);
  }
  assert.ok(!/setNotice\(["`]Pick /.test(text), `${file}: a notice says Pick, not Select`);
}
// Phosphor icons: Regular weight only, at a role size (BRAND.md Iconography): 20 tools, 18 rows, 16 chips and buttons,
// 12 small actions. Page thumbnails and the mark draw at their own sizes.
for (const [file, text] of tsx) {
  assert.ok(!/<[A-Z]\w*[^>]*\sweight=/.test(text), `${file}: an icon with a weight other than Regular`);
  for (const line of text.split("\n")) {
    for (const m of line.matchAll(/<([A-Z]\w*)[^<>]*?\ssize=\{(\d+)\}/g)) {
      if (["PageThumb", "Mark"].includes(m[1]) || (m[1] === "Plus" && line.includes("home-thumb"))) continue;
      assert.ok([12, 16, 18, 20].includes(Number(m[2])), `${file}: <${m[1]}> at ${m[2]} px`);
    }
  }
}
// Every close button in a panel header says Close.
for (const [file, text] of tsx) {
  for (const m of text.matchAll(/className="actions-close"[^>]*aria-label="([^"]+)"/g)) assert.ok(/^(Close|Full screen)/.test(m[1]), `${file}: close button "${m[1]}"`);
}
// UI text sizes on the type scale (tokens.json): 11, 13, 15, 20, 32, 64 px. The wordmark and the drawing's NMR shift
// labels (drawing units, not UI type) are the only exceptions.
const css = read("editor.css");
let selector = "";
for (const line of css.split("\n")) {
  if (line.includes("{")) selector = line;
  const m = /font(?:-size)?:\s*(?:\d00\s+)?(\d+)px/.exec(line);
  if (!m || /\.home-wordmark|\.nmr-shift/.test(selector)) continue;
  assert.ok([11, 13, 15, 20, 32, 64].includes(Number(m[1])), `editor.css: ${selector.trim()} uses ${m[1]} px`);
}

// One list of highlight colours, each with its own name and colour.
assert.equal(new Set(HIGHLIGHTS.map(([n]) => n)).size, HIGHLIGHTS.length);
assert.equal(new Set(HIGHLIGHTS.map(([, h]) => h.toLowerCase())).size, HIGHLIGHTS.length);
assert.ok(HIGHLIGHTS.every(([n, h]) => /^[A-Z][a-z]+$/.test(n) && /^#[0-9A-F]{6}$/.test(h)));
// Colour by element reads the atom-* tokens: nitrogen, oxygen, sulfur (and selenium), phosphorus, the halogens and the
// metals. Carbon, hydrogen and abbreviations such as Ph or Pr keep the ink colour.
const by = elementColours((name) => `token:${name}`);
assert.equal(by.N, "token:n");
assert.equal(by.O, "token:o");
assert.equal(by.S, "token:s");
assert.equal(by.Se, "token:s");
assert.equal(by.P, "token:p");
for (const e of ["F", "Cl", "Br", "I"]) assert.equal(by[e], "token:halogen");
for (const e of ["Pd", "Fe", "Li", "Na", "Pt", "Rh", "Bi"]) assert.equal(by[e], "token:metal");
for (const e of ["C", "H", "Ph", "Pr", "Ac", "Me", "B", "Si"]) assert.equal(by[e], undefined);
// The tokens are there to read, in both themes.
const tokens = read("../brand/tokens.css");
for (const name of ["n", "o", "s", "p", "halogen", "metal"]) assert.equal(tokens.match(new RegExp(`--atom-${name}:`, "g"))?.length, 3);

console.log("look: ok");
