// Run: node src/motion.check.ts. Fails loudly if a motion value is typed by hand instead of taken from the motion tokens,
// if tokens.css and tokens.json disagree on them, if the overshoot is used outside its two places (the toolbar drop
// and the atoms of the AI overlay's molecule), if an overlay leaves with no motion, or if the AI overlay breaks its
// rules: transform and opacity only, still under reduced motion, in the middle of the window, clear of the notice,
// each molecule built before it clears and never shown again after.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { BOND, HOLD, LEAD, LINGER, parts, SKETCHES } from "./magic.ts";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const css = read("./editor.css"), tokensCss = read("../brand/tokens.css");
const json = JSON.parse(read("../brand/tokens.json")) as { motion: { tokens: { name: string; value: string }[] } };

// tokens.css has every motion token in tokens.json, with the same value.
for (const t of json.motion.tokens) assert.equal(new RegExp(`--${t.name}: ([^;]+);`).exec(tokensCss)?.[1], t.value, `--${t.name}`);
// Fades and slides stay within 150-200 ms (--motion-drop is the one exception: the toolbar drop, and the atoms of the
// AI overlay's molecule).
for (const t of json.motion.tokens.filter((x) => x.name.startsWith("motion") && x.name !== "motion-drop")) {
  const ms = parseFloat(t.value);
  assert.ok(ms >= 150 && ms <= 200, `--${t.name} is ${t.value}`);
}

// Every transition and animation in editor.css uses the tokens. The only times typed by hand: the carried option's
// lean (90 ms, shorter than any token), the ripple's step, the Home tiles' step and the loops that pulse while
// something waits. The one curve typed by hand: the hold ring fills at an even rate, as it shows the hold time.
const lines = css.split("\n").map((text, i) => ({ text, line: i + 1 })).filter((l) => /^\s+(transition|animation)(-delay)?:/.test(l.text));
assert.ok(lines.length > 100, "found the motion rules");
for (const { text, line } of lines) {
  const left = text.replace(/var\(--[\w-]+\)/g, "").replace("transform 90ms", "").replace("22ms", "").replace("* 20ms", "").replace(/hold-fill\s+linear/, "").replace(/\d+(\.\d+)?s ease-in-out infinite/, "");
  assert.ok(!/\d+m?s\b/.test(left), `editor.css:${line} types a time: ${text.trim()}`);
  assert.ok(!/cubic-bezier|(^|[\s,])(ease|ease-out|ease-in|linear)([\s,;]|$)/.test(left), `editor.css:${line} types a curve: ${text.trim()}`);
}

// The overshoot curve (--ease-drop) only settles a shortcut dropped on the toolbar and ripples the others, and pops
// each atom of the molecule that builds while an AI app works (BRAND.md, Motion: the two places Octet bounces).
const bare = css.replace(/\/\*[\s\S]*?\*\//g, "");
const rules = [...bare.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => m[2].includes("--ease-drop")).map((m) => m[1].trim().replace(/\s+/g, " "));
assert.deepEqual(rules, [".tool.landed .glyph", ".palette.rippling .slot .glyph, .palette.rippling .tool:not(.landed) .glyph", ".mcp-atom"]);

// Every overlay that leaves through Exit (motion.tsx) has an exit motion.
const overlays = ["strip", "library", "page-menu", "properties", "spectrum", "coach", "name-field", "name-suggestion", "name-history", "tip"];
for (const overlay of overlays)
  assert.ok(new RegExp(`:is\\([^)]*\\.${overlay}(?=[,)])[^)]*\\)\\.leaving`).test(css), `.${overlay}.leaving`);
assert.match(css, /\.modal-backdrop\.leaving > \*/);
assert.match(css, /\.mcp-magic\.leaving \{\s*animation: /);
// A rule that gives an overlay its own way in with two or more classes (.page-menu.above) outranks the exit rule, so
// the exit rule names that case too. Rules for reduced motion do not count: there the overlay goes at once.
let full = bare, still = "";
for (let i; (i = full.indexOf("@media (prefers-reduced-motion: reduce)")) >= 0; ) {
  let j = full.indexOf("{", i), depth = 0;
  for (; j < full.length; j++) if (full[j] === "{") depth++; else if (full[j] === "}" && --depth === 0) break;
  still += full.slice(i, j + 1);
  full = full.slice(0, i) + full.slice(j + 1);
}
const exit = /([^{}]+)\{[^{}]*animation: leave /.exec(bare)![1];
for (const m of full.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
  if (!/animation(-name)?:/.test(m[2])) continue;
  for (const sel of m[1].split(",").map((s) => s.trim().replace(/\s+/g, " "))) {
    const last = sel.split(/[ >+~]+/).pop()!;
    if (overlays.some((o) => last.startsWith(`.${o}`) && !/^[\w-]/.test(last.slice(o.length + 1))) && (sel.match(/\.[\w-]+/g) ?? []).length > 1 && !sel.includes(".leaving"))
      assert.ok(exit.includes(`${sel}.leaving`), `${sel} sets its own animation, so the exit rule needs ${sel}.leaving`);
  }
}

// Every overlay that comes and goes is wrapped in its own Exit. A conditional that shows one (on its line, or the
// nearest one round it) starts with <Exit>{, and an Exit holds one conditional only: a second one beside the first
// would keep Exit open for good, so neither would leave with a motion. The command palette stays instant.
const sources = readdirSync(new URL(".", import.meta.url)).filter((f) => /\.tsx?$/.test(f) && !f.endsWith(".check.ts")).map((f) => ({ f, lines: read(`./${f}`).split("\n") }));
const overlay = /<(Dialog|Menu|TemplateLibrary|NoticeBar|Properties|Spectrum|Coach|SettingsWindow|ExportDialog|About|Feedback|ColourPop|McpMagic)\b/;
const indent = (s: string) => s.length - s.trimStart().length;
for (const { f, lines } of sources) {
  lines.forEach((text, i) => {
    if (!overlay.test(text) || /^\s*(\/\/|\*|import)/.test(text)) return;
    let at = text.includes("&& <") ? i : -1;
    for (let j = i - 1, depth = indent(text); at < 0 && j >= 0 && depth > 0; j--) {
      if (!lines[j].trim() || indent(lines[j]) >= depth) continue;
      depth = indent(lines[j]);
      if (/&& \(/.test(lines[j])) at = j;
    }
    if (at >= 0) assert.match(lines[at], /<Exit>\{/, `${f}:${i + 1} shows an overlay without Exit`);
  });
  lines.forEach((text, i) => {
    if (!text.includes("<Exit>{") || text.includes("}</Exit>")) return;
    for (let j = i + 1; j < lines.length && !lines[j].includes("}</Exit>"); j++)
      assert.ok(indent(lines[j]) !== indent(text) || !lines[j].trimStart().startsWith("{"), `${f}:${j + 1} is a second overlay in the Exit at line ${i + 1}`);
  });
}

// Animations made in script take their timing from the tokens too (motion.tsx, timing).
for (const { f, lines } of sources.filter((x) => x.f !== "motion.tsx"))
  lines.forEach((text, i) => assert.ok(!/cubic-bezier|duration: \d/.test(text), `${f}:${i + 1} types a motion value: ${text.trim()}`));

// The overlay that shows while an AI app works (McpMagic.tsx, magic.ts, the .mcp- rules). The user may draw under it,
// so its motions change transform and opacity only: nothing the browser lays the window out for, frame by frame.
const mcpFrames = [...bare.matchAll(/@keyframes (mcp-[\w-]+) \{((?:[^{}]*\{[^{}]*\})*)\s*\}/g)];
assert.deepEqual(mcpFrames.map((m) => m[1]), ["mcp-life", "mcp-gone", "mcp-draw", "mcp-pop", "mcp-pill-in", "mcp-twinkle"]);
for (const [, name, body] of mcpFrames)
  for (const m of body.matchAll(/([\w-]+):/g)) assert.ok(m[1] === "opacity" || m[1] === "transform", `@keyframes ${name} animates ${m[1]}`);
const mcpRules = [...full.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => m[1].includes(".mcp-"));
for (const m of mcpRules)
  for (const part of /transition: ([^;]+);/.exec(m[2])?.[1].split(",") ?? []) assert.match(part.trim(), /^(opacity|transform|visibility) /, `${m[1].trim()} moves ${part.trim()}`);
// What moves is a plain box. The browser moves a box's transform and opacity without the page's thread; an SVG's
// parts it lays out and paints again each frame, and a loop on an <svg> keeps the page's thread at work (measured in
// Chrome, 11 November 2026). So the molecule is boxes, and the pill's icon moves by the box round it.
const magic = read("./McpMagic.tsx");
assert.ok(!/<(svg|g|line|circle|path)\b/.test(magic), "McpMagic draws with SVG: Chrome lays its parts out and paints them each frame");
assert.match(magic, /<span className="mcp-sparkle" aria-hidden><Sparkle /);
// Reduced motion: every part of it that moves on its own is still.
const stilled = [...still.matchAll(/([^{}]+)\{[^{}]*animation: none/g)].flatMap((m) => m[1].split(",").map((s) => s.trim()));
for (const m of mcpRules)
  if (/animation: mcp-(?!pill-in)/.test(m[2])) for (const sel of m[1].split(",")) assert.ok(stilled.includes(sel.trim()), `${sel.trim()} moves under reduced motion`);
// The molecule is in the middle of the window for the whole time the overlay shows, the time the AI app thinks
// included (plan mcp-v2, section 9): one rule puts its ground there, and nothing moves it.
const rule = (selector: string) => [...bare.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => m[1].trim() === selector).map((m) => m[2]).join("");
assert.equal([...bare.matchAll(/([^{}]+)\{/g)].filter((m) => /\.mcp-stage\b/.test(m[1])).length, 1, "one rule places the molecule's ground");
assert.match(rule(".mcp-stage"), /top: 50%;\s*left: 50%;\s*width: 200px;\s*height: 200px;\s*margin: -100px 0 0 -100px;/);
assert.ok(!/transform|translate|transition|animation/.test(rule(".mcp-stage")), "the molecule's ground moves");
// The pill is where a notice is: at the bottom, the same distance up. An AI app's notice has Undo on it and comes as
// each call ends, while the pill still shows. So a notice sits above the pill for as long as the overlay is there: up
// by the pill's height and a space. The rule needs the notice to come after the overlay in the editor.
const space = (n: number) => parseFloat(new RegExp(`--space-${n}: ([\\d.]+)px;`).exec(tokensCss)![1]);
const pill = rule(".mcp-pill"), lift = /translate: 0 calc\(-(\d+)px - var\(--space-2\)\);/.exec(rule(".mcp-magic ~ .notice"));
assert.match(pill, /bottom: calc\(var\(--space-6\) \+ var\(--dock, 0px\)\);[\s\S]*padding: var\(--space-1\) [\s\S]*border: 1px /);
assert.match(rule(".notice"), /bottom: calc\(var\(--space-6\) \+ var\(--dock, 0px\)\);/);
assert.equal(Number(lift?.[1]), parseFloat(/min-height: (\d+)px;/.exec(pill)![1]) + 2 * space(1) + 2, "a notice is up by the pill's height, so the pill covers none of it");
assert.match(read("./Editor.tsx"), /<Exit>\{magic && <McpMagic [^\n]*\n\s*<Exit>\{notice && <NoticeBar /);
// A screen reader reads out who draws and the steps, as each changes. How far a call is changes many times in a call,
// so it is outside what is read out.
assert.match(magic, /<span className="mcp-said" role="status">\s*<span className="mcp-text text-ui">\{text\}<\/span>\s*<span className="mcp-steps text-ui">[^\n]*<\/span>\s*<\/span>\s*\{far && /);
assert.equal(magic.match(/role="status"/g)?.length, 1);
// A bond draws out from its first atom. Both ends of mcp-draw list the same transforms: an engine that does not fill
// the shorter list goes between the two as matrices, and scaleX(0) has none to go from, so the bond would jump in.
assert.match(rule(".mcp-bond"), /transform: rotate\(var\(--turn\)\) scaleX\(1\);/);
assert.match(mcpFrames[2][2], /transform: rotate\(var\(--turn\)\) scaleX\(0\);/);

// The molecules (magic.ts). Each is drawn true: every bond is one bond length, every atom is on a bond, and the whole
// stays on its ground (200 px across) however it turns.
const step = parseFloat(json.motion.tokens.find((t) => t.name === "motion")!.value), pop = parseFloat(json.motion.tokens.find((t) => t.name === "motion-drop")!.value);
// mcp-life: how long one molecule has (ms), and the parts of that time when it shows whole.
const life = /animation: mcp-life (\d+)s ease-in-out infinite/.exec(css)!, frames = [...mcpFrames[0][2].matchAll(/([\d%,\s]+)\{([^{}]*)\}/g)].flatMap((m) => m[1].split(",").map((p) => ({ at: parseFloat(p) / 100, opacity: /opacity: ([\d.]+)/.exec(m[2])?.[1] })));
const whole = frames.filter((f) => f.opacity === "1").map((f) => f.at * Number(life[1]) * 1000);
assert.ok(whole.length === 2 && whole[0] < whole[1], "mcp-life shows the molecule whole from one time to another");
// A molecule that cleared never shows again. The loop would show it 4% into its next turn, if the page is too busy
// to put the next molecule in on time: mcp-gone clears its parts for good as its turn ends, while the loop is clear,
// and McpMagic puts each molecule in a new element. mcp-gone is on an element of its own: a second animation on
// .mcp-mol took both off the browser's own thread (Chrome, 11 November 2026).
const gone = /animation: mcp-gone var\(--motion-fast\) var\(--ease-out\) calc\((\d+) \* var\(--motion\)\) forwards;/.exec(rule(".mcp-parts"));
const turnMs = Number(life[1]) * 1000, clearFor = Math.max(...frames.filter((f) => f.opacity === "0" && f.at < 0.5).map((f) => f.at)) * turnMs;
assert.ok(gone && Number(gone[1]) * step >= turnMs && Number(gone[1]) * step + parseFloat(json.motion.tokens.find((t) => t.name === "motion-fast")!.value) <= turnMs + clearFor, "mcp-gone starts as a molecule's turn ends, and ends while the loop is still clear");
assert.match(mcpFrames[1][2], /^\s*to \{\s*opacity: 0;\s*\}$/);
assert.match(rule(".mcp-mol"), /animation: mcp-life \d+s ease-in-out infinite;/, "mcp-life is the one animation on .mcp-mol");
assert.match(magic, /<div key=\{turn\} className="mcp-mol" onAnimationIteration=\{\(\) => setTurn\(turn \+ 1\)\}>\s*<div className="mcp-parts">/);
assert.ok(SKETCHES.length >= 3, "more than one molecule to build");
let centredBonds = 0;
for (const [k, sketch] of SKETCHES.entries()) {
  const p = parts(sketch), name = `molecule ${k + 1}`;
  const bonds = p.lines.slice(0, sketch.bonds.length), seconds = p.lines.slice(sketch.bonds.length);
  for (const b of bonds) assert.ok(Math.abs(b.length - BOND) < 0.02 * BOND, `${name}: a bond of ${(b.length / BOND).toFixed(3)} bond lengths`);
  assert.equal(new Set(sketch.bonds.flatMap(([a, b]) => [a, b])).size, sketch.atoms.length, `${name}: every atom is on a bond`);
  for (const d of p.dots) assert.ok(Math.hypot(d.x, d.y) + 4 <= 100, `${name}: an atom ${Math.hypot(d.x, d.y).toFixed(1)} px from the middle leaves its ground as it turns`);
  // Built in order: a bond starts at an atom that is there, and the atom it brings pops as it arrives. The second
  // lines of the double bonds come after every bond, each beside its bond and no longer.
  for (const [i, [from, to]] of sketch.bonds.entries()) {
    assert.ok(p.dots[from].at <= bonds[i].at, `${name}: bond ${i + 1} starts at an atom that is not there yet`);
    assert.ok(p.dots[to].at <= bonds[i].at + 1, `${name}: bond ${i + 1} ends in the air`);
  }
  assert.equal(seconds.length, sketch.bonds.filter((b) => b[2]).length, `${name}: a second line for each double bond`);
  for (const l of seconds) assert.ok(l.at > Math.max(...bonds.map((b) => b.at)) && l.length < 1.02 * BOND && l.at <= p.end, `${name}: a second line out of place`);
  // A double bond in a ring has its bond on the atoms and a shorter line inside. One to an end atom (a C=O) is
  // centred, as the page draws it (render.ts): two whole lines, the same distance each side of the atoms.
  const ends = sketch.atoms.map((_, i) => sketch.bonds.filter((b) => b[0] === i || b[1] === i).length === 1);
  for (const [n, i] of sketch.bonds.flatMap((b, i) => (b[2] ? [i] : [])).entries()) {
    const from = p.dots[sketch.bonds[i][0]], first = bonds[i], second = seconds[n], off = (l: typeof first) => Math.hypot(l.x - from.x, l.y - from.y);
    if (ends[sketch.bonds[i][0]] || ends[sketch.bonds[i][1]]) {
      centredBonds++;
      assert.ok(second.length === first.length && Math.abs(off(first) - 0.09 * BOND) < 1e-9 && Math.abs(first.x + second.x - 2 * from.x) < 1e-9 && Math.abs(first.y + second.y - 2 * from.y) < 1e-9, `${name}: the double bond to an end atom is to one side`);
    } else assert.ok(off(first) === 0 && second.length < first.length, `${name}: a ring's double bond is off its atoms`);
  }
  // The first atom comes once the loop shows; the last motion ends a second or more before the molecule clears.
  assert.ok(Math.min(...p.dots.map((d) => d.at)) * step >= whole[0], `${name} starts before it shows`);
  assert.ok(p.end * step + pop + 1000 <= whole[1], `${name} is built at ${Math.round(p.end * step + pop)} ms, and clears from ${whole[1]} ms`);
}
assert.ok(LEAD * step >= whole[0], "the wait before the first atom covers the time the loop is clear");
assert.equal(centredBonds, 4, "caffeine and aspirin have two C=O each");
// The soft window of a call stays long enough for its fade in to end before its fade out starts, and the overlay stays
// about 8 s after the last call (plan mcp-v2, section 9), which the editor takes from magic.ts.
assert.ok(HOLD >= 2 * parseFloat(json.motion.tokens.find((t) => t.name === "motion-slow")!.value) && HOLD < LINGER);
assert.ok(LINGER >= 6000 && LINGER <= 10000, `the overlay stays ${LINGER} ms after the last call`);
assert.match(read("./Editor.tsx"), /setTimeout\(\(\) => setMagic\(undefined\), LINGER\)/);
console.log("motion.check: ok");
