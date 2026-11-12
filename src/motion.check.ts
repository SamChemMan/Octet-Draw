// Run: node src/motion.check.ts. Fails loudly if a motion value is typed by hand instead of taken from the motion tokens,
// if tokens.css and tokens.json disagree on them, if the overshoot is used outside the toolbar drop, if an overlay
// leaves with no motion, or if the AI overlay breaks its rules: transform and opacity only, still under reduced
// motion, in the middle of the window, clear of the notice, and Octet's mark drawn true to app-icon.svg, whole before
// it clears and never shown again after.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { DEMO_MOLS, FILL, HEXAGON, HOLD, LEAD, LINE, LINGER, mark, MARK, OCTAGON } from "./magic.ts";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const css = read("./editor.css"), tokensCss = read("../brand/tokens.css");
const json = JSON.parse(read("../brand/tokens.json")) as { motion: { tokens: { name: string; value: string }[] } };

// tokens.css has every motion token in tokens.json, with the same value.
for (const t of json.motion.tokens) assert.equal(new RegExp(`--${t.name}: ([^;]+);`).exec(tokensCss)?.[1], t.value, `--${t.name}`);
// Fades and slides stay within 150-200 ms (--motion-drop is the one exception: the toolbar drop).
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

// The overshoot curve (--ease-drop) only settles a shortcut dropped on the toolbar and ripples the others (BRAND.md,
// Motion: the one place Octet bounces).
const bare = css.replace(/\/\*[\s\S]*?\*\//g, "");
const rules = [...bare.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => m[2].includes("--ease-drop")).map((m) => m[1].trim().replace(/\s+/g, " "));
assert.deepEqual(rules, [".tool.landed .glyph", ".palette.rippling .slot .glyph, .palette.rippling .tool:not(.landed) .glyph"]);

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
assert.deepEqual(mcpFrames.map((m) => m[1]), ["mcp-life", "mcp-gone", "mcp-draw", "mcp-fade", "mcp-pill-in", "mcp-twinkle"]);
for (const [, name, body] of mcpFrames)
  for (const m of body.matchAll(/([\w-]+):/g)) assert.ok(m[1] === "opacity" || m[1] === "transform", `@keyframes ${name} animates ${m[1]}`);
const mcpRules = [...full.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => m[1].includes(".mcp-"));
for (const m of mcpRules)
  for (const part of /transition: ([^;]+);/.exec(m[2])?.[1].split(",") ?? []) assert.match(part.trim(), /^(opacity|transform|visibility) /, `${m[1].trim()} moves ${part.trim()}`);
// What moves is a plain box. The browser moves a box's transform and opacity without the page's thread; an SVG's
// parts it lays out and paints again each frame, and a loop on an <svg> keeps the page's thread at work (measured in
// Chrome, 11 November 2026). So the mark is boxes, and the pill's icon moves by the box round it.
const magic = read("./McpMagic.tsx");
assert.ok(!/<(svg|g|line|circle|path)\b/.test(magic), "McpMagic draws with SVG: Chrome lays its parts out and paints them each frame");
assert.match(magic, /<span className="mcp-sparkle" aria-hidden><Sparkle /);
// Reduced motion: every part of it that moves on its own is still.
const stilled = [...still.matchAll(/([^{}]+)\{[^{}]*animation: none/g)].flatMap((m) => m[1].split(",").map((s) => s.trim()));
for (const m of mcpRules)
  if (/animation: mcp-(?!pill-in)/.test(m[2])) for (const sel of m[1].split(",")) assert.ok(stilled.includes(sel.trim()), `${sel.trim()} moves under reduced motion`);
// The mark is in the middle of the window for the whole time the overlay shows, the time the AI app thinks included
// (plan mcp-v2, section 9): one rule puts its ground there, and nothing moves it.
const rule = (selector: string) => [...bare.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => m[1].trim() === selector).map((m) => m[2]).join("");
assert.equal([...bare.matchAll(/([^{}]+)\{/g)].filter((m) => /\.mcp-stage\b/.test(m[1])).length, 1, "one rule places the mark's ground");
assert.match(rule(".mcp-stage"), /top: 50%;\s*left: 50%;\s*width: 200px;\s*height: 200px;\s*margin: -100px 0 0 -100px;/);
assert.ok(!/transform|translate|transition|animation/.test(rule(".mcp-stage")), "the mark's ground moves");
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
assert.match(magic, /<span className="mcp-said" role="status">\s*<span className="mcp-text text-ui">\{text\}<\/span>\s*(\{magic\.steps !== undefined && )?<span className="mcp-steps text-ui">[^\n]*<\/span>\}?\s*<\/span>\s*\{far && /);
assert.equal(magic.match(/role="status"/g)?.length, 1);
// A line draws out from its start. Both ends of mcp-draw list the same transforms: an engine that does not fill
// the shorter list goes between the two as matrices, and scaleX(0) has none to go from, so the bond would jump in.
assert.match(rule(".mcp-bond"), /transform: rotate\(var\(--turn\)\) scaleX\(1\);/);
assert.match(mcpFrames[2][2], /transform: rotate\(var\(--turn\)\) scaleX\(0\);/);

// mcp-life: how long one drawing of the mark has (ms), and the parts of that time when it shows whole.
const step = parseFloat(json.motion.tokens.find((t) => t.name === "motion")!.value);
const life = /animation: mcp-life (\d+(?:\.\d+)?)s ease-in-out infinite/.exec(css)!, frames = [...mcpFrames[0][2].matchAll(/([\d%,\s]+)\{([^{}]*)\}/g)].flatMap((m) => m[1].split(",").map((p) => ({ at: parseFloat(p) / 100, opacity: /opacity: ([\d.]+)/.exec(m[2])?.[1] })));
const turnMs = Number(life[1]) * 1000, whole = frames.filter((f) => f.opacity === "1").map((f) => f.at * turnMs);
assert.ok(whole.length === 2 && whole[0] < whole[1], "mcp-life shows the mark whole from one time to another");
assert.ok(turnMs >= 4000 && turnMs <= 6000, `one drawing of the mark takes ${turnMs} ms; 4 to 6 s is calm`);
// A mark that cleared never shows again. The loop would show it again early in its next turn, if the page is too
// busy to put the next one in on time: mcp-gone clears its parts for good as its turn ends, while the loop is clear,
// and McpMagic puts each drawing in a new element. mcp-gone is on an element of its own: a second animation on
// .mcp-mol took both off the browser's own thread (Chrome, 11 November 2026).
const gone = /animation: mcp-gone var\(--motion-fast\) var\(--ease-out\) calc\((\d+) \* var\(--motion\)\) forwards;/.exec(rule(".mcp-parts"));
const clearFor = Math.max(...frames.filter((f) => f.opacity === "0" && f.at < 0.5).map((f) => f.at)) * turnMs;
assert.ok(gone && Number(gone[1]) * step >= turnMs && Number(gone[1]) * step + parseFloat(json.motion.tokens.find((t) => t.name === "motion-fast")!.value) <= turnMs + clearFor, "mcp-gone starts as a turn ends, and ends while the loop is still clear");
assert.match(mcpFrames[1][2], /^\s*to \{\s*opacity: 0;\s*\}$/);
assert.match(rule(".mcp-mol"), /animation: mcp-life [\d.]+s ease-in-out infinite;/, "mcp-life is the one animation on .mcp-mol");
assert.match(magic, /<div key=\{turn\} className="mcp-mol" onAnimationIteration=\{\(\) => setTurn\(turn \+ 1\)\}>\s*<div className="mcp-parts"/);
// It leaves softly: an opacity and a small scale, no turn.
assert.match(mcpFrames[0][2], /to \{\s*opacity: 0;\s*transform: scale\(0\.98\);\s*\}/);

// The mark (magic.ts) is app-icon.svg's mark. The icon's octagon and hexagon are the ones magic.ts draws, and the
// solid mark's shape (.mcp-fill) is the same numbers. Every line is the line width, lies under the solid mark when it
// comes, and touches the hole's edge (the hexagon's bonds) or the mark's outline (the octagon's edges), so the hand-off
// from the lines to the solid mark moves no edge.
const icon = read("../src-tauri/icons/app-icon.svg"), shape = /<path d="(M292\.89[^"]+)" fill="#213C99" fill-rule="evenodd"/.exec(icon)![1];
const loops = shape.split(" Z").filter((x) => x.trim()).map((loop) => [...loop.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]));
// The icon goes round its hole the other way (evenodd: the way does not matter); magic.ts goes clockwise from the top.
assert.deepEqual([loops[0], [loops[1][0], ...loops[1].slice(1).reverse()]], [OCTAGON, HEXAGON], "magic.ts has app-icon.svg's mark");
const clip = /clip-path: polygon\(evenodd, ([^;]+)\);/.exec(rule(".mcp-fill"))![1].split(", ").map((p) => p.split(" ").map((v) => Math.round(parseFloat(v) * 1000) / 100));
assert.deepEqual(clip, [...OCTAGON, OCTAGON[0], ...HEXAGON, HEXAGON[0]], ".mcp-fill is cut to the icon's mark");
assert.match(magic, /<div className="mcp-fill" style=\{\{ width: MARK, height: MARK, margin: -MARK \/ 2 \}\} \/>/);
assert.match(rule(".mcp-bond"), new RegExp(`height: ${LINE}px;\\s*margin: -${LINE / 2}px 0 0 -${LINE / 2}px;[\\s\\S]*transform-origin: ${LINE / 2}px 50%;`));
const m = mark(), u = MARK / 1000;
// How far a line's axis is from the mark's middle (px).
const reach = (l: (typeof m.bonds)[number]) => { const t = (l.turn * Math.PI) / 180; return Math.abs(l.x * Math.sin(t) - l.y * Math.cos(t)); };
assert.equal(m.bonds.length, 6);
assert.equal(m.edges.length, 8);
for (const l of m.bonds) assert.ok(Math.abs(reach(l) - LINE / 2 - 361.13 * u) < 0.02, `a hexagon bond's inner edge is ${(reach(l) - LINE / 2).toFixed(2)} px out, the hole's is ${(361.13 * u).toFixed(2)}`);
for (const l of m.edges) assert.ok(Math.abs(reach(l) + LINE / 2 - 500 * u) < 0.02, `an octagon edge's outer edge is ${(reach(l) + LINE / 2).toFixed(2)} px out, the mark's is ${500 * u}`);
// The Kekulé lines are a ring's double bonds as the page draws them (render.ts): 18% of the bond in, cut back to the
// bisector of the ring's angle at each end.
const bond = m.bonds[0].length;
for (const l of m.inner) assert.ok(Math.abs(reach(l) - (reach(m.bonds[0]) - 0.18 * bond)) < 1e-3 && Math.abs(l.length - (bond - (2 * 0.18 * bond) / Math.tan(Math.PI / 3))) < 1e-3, "a Kekulé line out of place");
assert.equal(m.inner.length, 3);
// In order: the hexagon's bonds one after another, the inner lines, then the octagon's edges, then the solid mark. All
// of it starts once the loop shows, and the mark is whole a second or more before it clears.
const ats = (ls: { at: number }[]) => ls.map((l) => l.at), inOrder = (xs: number[]) => xs.every((x, i) => !i || x > xs[i - 1]);
assert.ok(inOrder([...ats(m.bonds), ...ats(m.inner)]) && inOrder([Math.max(...ats(m.inner)), ...ats(m.edges)]) && Math.max(...ats(m.edges)) < FILL, "the mark draws out of order");
assert.ok(LEAD * step >= whole[0], "the first line starts before the loop shows");
assert.ok((FILL + 2) * step + 1000 <= whole[1], `the mark is whole at ${(FILL + 2) * step} ms, and clears from ${whole[1]} ms`);
assert.match(rule(".mcp-fill") + rule(".mcp-kekule"), /animation-delay: calc\(var\(--fill\) \* var\(--motion\)\);[\s\S]*animation-delay: calc\(var\(--fill\) \* var\(--motion\)\);/);
assert.match(magic, /<div className="mcp-parts" style=\{\{ "--fill": FILL \} as CSSProperties\}>/);
// Reduced motion leaves the still mark: the inner lines gone and the solid mark there.
assert.match(rule(".mcp-kekule"), /^\s*opacity: 0;/);
assert.ok(!/opacity/.test(rule(".mcp-fill")));

// Image to Structure's first-use card (PictureDemo): each molecule is Octet's own drawing, its heteroatoms labelled,
// and the drawing shows in step with the read line (the same loop, curve and times).
assert.ok(DEMO_MOLS.length >= 3 && DEMO_MOLS.every(({ mol }) => mol.atoms.some((a) => a.label !== "C")), "the card's molecules are real drug molecules, with their O and N");
const loop = (name: string) => [...bare.matchAll(new RegExp(`@keyframes ${name} \\{((?:[^{}]*\\{[^{}]*\\})*)\\s*\\}`, "g"))][0][1].match(/[\d%,\s]+(?=\{)/g)!.map((x) => x.trim().replace(/\s+/g, " "));
const scan = loop("pic-scan"), reveal = loop("pic-reveal");
assert.ok(reveal[0] === scan[0] && reveal[1].split(",")[0] === scan[1], "the drawing shows in step with the read line");
assert.match(css, /animation: pic-scan (\d+)s ease-in-out infinite;[\s\S]*animation: pic-reveal \1s ease-in-out infinite;/);

// The soft window of a call stays long enough for its fade in to end before its fade out starts, and the overlay stays
// about 8 s after the last call (plan mcp-v2, section 9), which the editor takes from magic.ts.
assert.ok(HOLD >= 2 * parseFloat(json.motion.tokens.find((t) => t.name === "motion-slow")!.value) && HOLD < LINGER);
assert.ok(LINGER >= 6000 && LINGER <= 10000, `the overlay stays ${LINGER} ms after the last call`);
assert.match(read("./Editor.tsx"), /setTimeout\(\(\) => setMagic\(undefined\), LINGER\)/);
console.log("motion.check: ok");
