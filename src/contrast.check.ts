// Run: node src/contrast.check.ts. Fails loudly if a pair of colour tokens the interface puts together is below WCAG
// AA in either theme (4.5:1 for text, 3:1 for control edges and the focus ring), if tokens.css and tokens.json
// disagree on a colour, if the two copies of the dark theme in tokens.css differ, or if editor.css puts faint text on
// a sunken or mist fill or types a colour by hand outside the page papers and the colour picker.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const tokensCss = read("../brand/tokens.css"), css = read("./editor.css"), json = JSON.parse(read("../brand/tokens.json"));

// The custom properties in the block that starts at a selector in tokens.css.
function block(selector: string): Record<string, string> {
  const at = tokensCss.indexOf(selector);
  assert.ok(at >= 0, `tokens.css has ${selector}`);
  const body = tokensCss.slice(tokensCss.indexOf("{", at) + 1, tokensCss.indexOf("}", at));
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}
const light = block(':root, [data-theme="light"] {'), dark = block('[data-theme="dark"] {');
assert.deepEqual(block(':root:not([data-theme="light"]) {'), dark, "the system dark theme and data-theme=dark set the same values");

// tokens.css has every colour in tokens.json, with the same value.
const same = (v: string) => v.toLowerCase().replace(/\s+/g, "");
for (const t of json.color.tokens as { name: string; value: { light: string; dark: string } }[]) {
  assert.equal(same(light[t.name] ?? ""), same(t.value.light), `--${t.name} (light) in tokens.css matches tokens.json`);
  assert.equal(same(dark[t.name] ?? ""), same(t.value.dark), `--${t.name} (dark) in tokens.css matches tokens.json`);
}

// Contrast as WCAG 2 measures it. A colour with alpha is put over what is under it first.
type RGBA = [number, number, number, number];
function rgba(v: string): RGBA {
  const hex = /^#([0-9a-f]{6})$/i.exec(v);
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16)).concat(1) as RGBA;
  const fn = /^rgba?\(([^)]+)\)$/.exec(v);
  assert.ok(fn, `a colour: ${v}`);
  const [r, g, b, a = 1] = fn[1].split(",").map(Number);
  return [r, g, b, a];
}
const over = ([r, g, b, a]: RGBA, [R, G, B]: RGBA): RGBA => [r * a + R * (1 - a), g * a + G * (1 - a), b * a + B * (1 - a), 1];
const lum = ([r, g, b]: RGBA) => [r, g, b].map((c) => (c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4).reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
function contrast(fg: string, bg: string): number {
  const b = rgba(bg), f = over(rgba(fg), b), [x, y] = [lum(f), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
assert.equal(contrast("#000000", "#FFFFFF").toFixed(1), "21.0");
assert.equal(contrast("#767676", "#FFFFFF").toFixed(2), "4.54");

const pairs: [need: number, fgs: string[], bgs: string[]][] = [
  // Text and icons on every surface.
  [4.5, ["ink", "ink-muted", "ink-faint", "link", "success", "warning", "error"], ["canvas", "surface", "surface-raised"]],
  // On a sunken well, a hovered row or a chosen (mist) row: faint ink is too light there, so these are what may sit on it.
  [4.5, ["ink", "ink-muted", "link"], ["surface-sunken", "brand-mist"]],
  // On fills.
  [4.5, ["on-brand"], ["brand", "brand-hover"]],
  [4.5, ["on-tooltip"], ["tooltip"]],
  // Control edges and tracks (switches, check boxes), and the focus ring, against the surfaces they sit on.
  [3, ["outline", "brand-bright"], ["surface", "surface-raised"]],
  // The focus ring round objects on the canvas (CanvasAccess.tsx; other page colours: access.ts ringOn).
  [3, ["brand-bright"], ["canvas"]],
];
for (const [name, theme] of [["light", light], ["dark", dark]] as const)
  for (const [need, fgs, bgs] of pairs)
    for (const fg of fgs) for (const bg of bgs) {
      const r = contrast(theme[fg], theme[bg]);
      assert.ok(r >= need, `${name}: --${fg} on --${bg} is ${r.toFixed(2)}:1, under ${need}:1`);
    }
// Dark swatches (black, ink) on a dark panel keep a 3:1 edge.
assert.ok(contrast(dark["swatch-edge"], dark["surface-raised"]) >= 3, "dark: swatch edge on surface-raised");
// The backdrop dims the window in both themes: never lighter than what is under it.
for (const theme of [light, dark]) for (const bg of ["canvas", "surface", "surface-raised"])
  assert.ok(lum(over(rgba(theme.backdrop), rgba(theme[bg]))) <= lum(rgba(theme[bg])), `the backdrop dims --${bg}`);

// editor.css: no rule puts faint ink on a sunken or mist fill, and colours come from tokens. The page papers (white,
// dark, blueprint), the colour picker's hue and value fields, and the white switch and slider knobs are the
// exceptions: they show fixed colours on purpose.
const rules = [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1].trim().replace(/\s+/g, " "), body: m[2] }));
// A control that turns sunken or mist on hover takes its faint text (a key hint) to ink-muted with it.
const all = rules.flatMap((r) => r.selector.split(",").map((sel) => ({ sel: sel.trim(), body: r.body })));
for (const { sel, body } of all) {
  if (!sel.endsWith(":hover") || !/background(-color)?:\s*var\(--(surface-sunken|brand-mist)\)/.test(body)) continue;
  const base = sel.slice(0, -":hover".length);
  for (const inner of all.filter((x) => x.sel.startsWith(`${base} `) && /color:\s*var\(--ink-faint\)/.test(x.body)))
    assert.ok(all.some((x) => x.sel === `${sel}${inner.sel.slice(base.length)}` && !/--ink-faint/.test(x.body)), `${inner.sel}: faint ink on ${sel}'s sunken fill`);
}
for (const r of rules) {
  if (/color:\s*var\(--ink-faint\)/.test(r.body)) assert.ok(!/background(-color)?:\s*var\(--(surface-sunken|brand-mist)\)/.test(r.body), `${r.selector}: faint ink on a sunken or mist fill`);
  if (/paper|picker|switch|slider/.test(r.selector)) continue;
  const typed = r.body.match(/#[0-9a-f]{3,8}\b|rgba?\(/gi);
  assert.ok(!typed, `${r.selector}: a colour typed by hand (${typed}); use a token from brand/tokens.css`);
}
console.log("contrast.check: ok");
