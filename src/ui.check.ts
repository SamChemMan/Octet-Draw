// Run: node src/ui.check.ts. Fails loudly if a control's look is typed by hand instead of taken from the tokens: its
// size, corners, spacing, layer, font, colour, shadow, press, hover, disabled or selected look, or how an overlay comes
// in and goes out. The rules are in brand/BRAND.md (Controls). motion.check.ts covers times and curves, look.check.ts
// the type scale and icon sizes, contrast.check.ts the colours' contrast.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const css = read("./editor.css"), tokensCss = read("../brand/tokens.css");
const json = JSON.parse(read("../brand/tokens.json")) as Record<string, { tokens: { name: string; value: string | { light: string; dark: string } }[] }>;

// tokens.css has every size, state, layer, radius and spacing token in tokens.json, with the same value.
for (const group of ["size", "state", "layer", "radius", "spacing"]) {
  for (const t of json[group].tokens) assert.equal(new RegExp(`--${t.name}: ([^;]+);`).exec(tokensCss)?.[1], t.value, `--${t.name}`);
}
const sizes = new Map(json.size.tokens.map((t) => [parseInt(t.value as string), t.name]));

// Every rule in editor.css, with the @media blocks it is in. Comments are gone.
type Rule = { selector: string; parts: string[]; body: string; props: Map<string, string>; media: string[] };
const rules: Rule[] = [];
{
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const stack: string[] = [];
  for (const m of bare.matchAll(/([^{}]*)\{|\}/g)) {
    if (m[0] === "}") { stack.pop(); continue; }
    const head = m[1].trim().replace(/\s+/g, " ");
    if (head.startsWith("@")) { stack.push(head); continue; }
    stack.push("");
    const end = bare.indexOf("}", m.index! + m[0].length), body = bare.slice(m.index! + m[0].length, end);
    if (body.includes("{")) continue; // a keyframe step holder: its steps are rules of their own
    const props = new Map([...body.matchAll(/([\w-]+)\s*:\s*([^;]+);/g)].map((d) => [d[1], d[2].trim()]));
    rules.push({ selector: head, parts: head.split(",").map((s) => s.trim()), body, props, media: stack.filter((s) => s.startsWith("@")) });
  }
}
assert.ok(rules.length > 1000, `found the rules (${rules.length})`);
const inKeyframes = (r: Rule) => r.media.some((m) => m.startsWith("@keyframes"));
const has = (r: Rule, ...names: string[]) => names.some((n) => r.parts.some((p) => p.includes(n)));

// 1. Sizes. A control's height is a size token. A height typed by hand that equals a token is a control that missed
// it; the marks below are not controls (a knob, a swatch, a thumbnail, a ring round a tool).
const NOT_CONTROLS = [".search-clear", ".switch", ".swatch", ".library-rename", ".command-icon", ".paper-choice", ".halo", ".hold-ring", ".indicator", ".carry", ".pin-slot", ".name-recent.show-all", ".library-head", ".name-thumb", ".floating-head", ".page-option-thumb", ".library-set-name", ".char-map .char", ".eyedropper", ".fold-title", ".palette-toggle", ".badge", ".spectrum-swatches", ".home-name-field", ".home-carry-count", ".ghs", ".remove-bin", ".segmented.purposes"];
for (const r of rules) {
  if (inKeyframes(r) || has(r, ...NOT_CONTROLS)) continue;
  const h = /^(\d+)px$/.exec(r.props.get("height") ?? "");
  if (h && sizes.has(Number(h[1]))) assert.fail(`${r.selector}: height ${h[1]}px is --${sizes.get(Number(h[1]))}; use the token`);
  if (h && [20, 22, 26].includes(Number(h[1]))) assert.fail(`${r.selector}: ${h[1]}px is not a control size (18, 24, 28, 30, 32, 36)`);
}
// The controls themselves hold the token for their kind.
const sizeOf: Record<string, string[]> = {
  "size-action": [".close-x, .segmented button.close-x", ".variant-action", ".name-forget", ".problem-hide", ".home-remove", ".key-remove"],
  "size-control-sm": [".actions-close", ".floating-size", ".key-add", ".library-keep", ".home-act", ".pill", ".problem-buttons button", ".name-options button", ".notes-tab"],
  "size-control": [".text-button", ".dialog-button", ".spectrum-button", ".prop-add", ".home-open", ".page-button", ".select-field", ".unit-field", ".segmented", ".list-find", ".settings-search, .library-search"],
  "size-row": [".action", ".chip", ".module", ".library-category", ".strip.list .variant"],
  "size-tool": [".tool", ".tray-button", ".export-button", ".feedback-link", ".actions-reopen"],
  "size-cell": [".variant", ".command"],
};
for (const [token, selectors] of Object.entries(sizeOf)) {
  for (const s of selectors) assert.ok(rules.some((r) => r.selector === s && r.props.get("height") === `var(--${token})`), `${s} is var(--${token}) high`);
}

// 2. Corners, spacing and layers come from the tokens. 0, 1 px and 2 px are lines, not spacing.
for (const r of rules) {
  if (inKeyframes(r)) continue;
  const radius = r.props.get("border-radius");
  if (radius) assert.ok(/^(var\(--radius-[\w-]+\)|inherit|0|calc\(var\(--radius-lg\) \+ var\(--space-4\)\)|(0|var\(--radius-sm\))( (0|var\(--radius-sm\))){3})$/.test(radius), `${r.selector}: border-radius ${radius}`);
  for (const [name, value] of r.props) {
    if (!/^(gap|padding|margin)(-|$)/.test(name)) continue;
    const outside = value.replace(/calc\([^;]*\)/g, "");
    for (const px of outside.matchAll(/(?<![\w.-])(\d+(?:\.\d+)?)px/g)) {
      assert.ok(Number(px[1]) <= 2, `${r.selector}: ${name} ${value} types ${px[0]}; use a --space token`);
    }
  }
  const z = r.props.get("z-index");
  // Inside one component a part goes behind or in front of its siblings with a small number.
  const LOCAL = [".indicator", ".home-section.lifted::after", ".menu-head", ".notes-nav", ".home-section.lifted", ".remove-shade", ".folder-front"];
  if (z) assert.ok(/^var\(--z-[\w-]+\)$/.test(z) || r.parts.some((p) => LOCAL.includes(p)), `${r.selector}: z-index ${z}; use a --z token`);
}

// 3. Type. 13 px text has the 18 px line of the type scale, and no weight is heavier than the 600 the app bundles.
for (const r of rules) {
  const font = r.props.get("font");
  if (font) assert.ok(!/\b13px(?!\/)/.test(font), `${r.selector}: font ${font} has no line height (13px/18px)`);
  const weight = r.props.get("font-weight") ?? /^(\d00) /.exec(font ?? "")?.[1];
  if (weight) assert.ok(["400", "500", "600", "inherit", "normal"].includes(weight), `${r.selector}: weight ${weight}`);
}
// Every button and field has Octet's font and 13 px text unless its class says otherwise (a button takes the system's
// font and size if nothing sets them: 11 px in WebKit, 13.33 px in Chromium).
assert.match(css, /\nbutton,\ninput,\nselect,\ntextarea \{\n  font-size: 13px;\n\}/);

// 4. Colour and depth. No colour is typed by hand in the chrome: the paper choices, the colour picker's own spectrum
// and the focus ring on blueprint paper are the drawing's colours, not the chrome's.
const PAPER = [".paper-", ".paper-blueprint", ".blueprint", ".picker-", ".canvas-access"];
for (const r of rules) {
  if (has(r, ...PAPER) || inKeyframes(r)) continue;
  for (const [name, value] of r.props) {
    if (name.startsWith("--")) continue;
    assert.ok(!/#[0-9a-fA-F]{3,8}\b|\brgba?\(/.test(value), `${r.selector}: ${name} types a colour: ${value}`);
  }
  // One elevation (--shadow-float); a knob has --shadow-knob. Rings (no blur) are edges, not shadows.
  const shadow = r.props.get("box-shadow");
  if (!shadow || has(r, ".tool::after", ".tool.turn-3d::after")) continue; // the 3D tool's glow while it turns
  let flat = shadow;
  while (/\([^()]*\)/.test(flat)) flat = flat.replace(/(var\(--shadow-(?:float|focus|knob)\))|\([^()]*\)/g, (all, token) => (token ? "TOKEN" : ""));
  for (const layer of flat.split(",").map((l) => l.trim().replace(/^inset /, ""))) {
    if (layer === "TOKEN" || layer === "none") continue;
    const blur = layer.split(/\s+/)[2];
    assert.ok(blur === "0", `${r.selector}: box-shadow ${shadow} is a second elevation; use --shadow-float, or --shadow-knob under a knob`);
  }
}

// 5. States, one look each.
// Press: every button scales by the press token (the base rule), small and large controls by theirs. Only the slider's
// thumb grows, as it is picked up.
assert.match(css, /\n:where\(button:not\(:disabled\)\):active \{\n  transform: scale\(var\(--press\)\);\n\}/);
for (const r of rules) {
  if (!r.selector.includes(":active") || !r.props.has("transform")) continue;
  assert.ok(/^(scale\(var\(--press(-small|-large)?\)\)|none)$/.test(r.props.get("transform")!) || r.selector.includes("slider"), `${r.selector}: press ${r.props.get("transform")}`);
}
// Hover, press and a change of state fade over the short token on every button. A class with its own transition names
// transform, so its press is not a jump.
assert.match(css, /\nbutton \{\n  transition: background-color var\(--motion-fast\) var\(--ease-out\), color var\(--motion-fast\) var\(--ease-out\), border-color var\(--motion-fast\) var\(--ease-out\), transform var\(--motion-fast\) var\(--ease-out\);\n\}/);
// Disabled: the base rule's opacity and nothing else.
assert.match(css, /\nbutton:disabled,\ninput:disabled,\n\[aria-disabled="true"\] \{\n  opacity: var\(--disabled\);\n\}/);
for (const r of rules) {
  if (!/:disabled|aria-disabled/.test(r.selector) || /:not\([^)]*:disabled/.test(r.selector) && !/:disabled(?![^(]*\))/.test(r.selector.replace(/:not\([^)]*\)/g, ""))) continue;
  if (r.selector === ".dialog-row:has(input:disabled)") continue; // the label beside a field that does not apply
  for (const name of ["color", "background", "background-color", "border-color"]) assert.ok(!r.props.has(name), `${r.selector}: a disabled control changes only its opacity, not ${name}`);
  const o = r.props.get("opacity");
  if (o) assert.ok(o === "var(--disabled)" || (o === "1" && r.selector === ".unit-field input:disabled"), `${r.selector}: opacity ${o}`);
}
// Selected, pressed or current: the mist fill and the link colour. A switch and a tick box are on with the brand fill;
// a swatch and a paper show their own colour, so their edge says which is chosen.
const OWN_SELECTED = [".switch", ".prop-check", ".swatch", ".paper-choice", ".page-thumb", ".tool", ".home-", ".canvas"];
for (const r of rules) {
  if (!/aria-(pressed|checked|selected|current)(="true")?\]/.test(r.selector) || /:not\(\[aria-/.test(r.selector) || has(r, ...OWN_SELECTED)) continue;
  const bg = r.props.get("background") ?? r.props.get("background-color");
  if (bg && !/:hover|:active/.test(r.selector)) assert.ok(/^(var\(--brand-mist\)|transparent|none)$/.test(bg), `${r.selector}: a selected control has the mist fill, not ${bg}`);
}
// Hover: a look that changes under the pointer is inside the hover gate, so a touch screen does not hold it. A rule
// that shows a hidden control for a row, or that shares its look with focus or a drag, stays outside.
for (const r of rules) {
  if (inKeyframes(r) || r.media.some((m) => m.includes("hover: hover"))) continue;
  const own = r.parts.every((p) => /:hover(:not\([^)]*\))*$/.test(p));
  assert.ok(!own, `${r.selector}: put this hover rule inside @media (hover: hover) and (pointer: fine)`);
}
// The fill under the pointer is the sunken colour (on a sunken ground, one step more: the hairline colour).
for (const r of rules) {
  if (!r.parts.every((p) => /:hover/.test(p)) || has(r, ".scrollbar", ".dialog-button.primary", "[data-over]", ".library.dragging", "[data-drop")) continue;
  const bg = r.props.get("background") ?? r.props.get("background-color");
  if (bg) assert.ok(/^(var\(--surface-sunken\)|var\(--hairline\)|var\(--surface-raised\)|var\(--brand-hover\)|color-mix\(in oklab, var\(--brand-mist\) 45%, var\(--canvas\)\))$/.test(bg), `${r.selector}: hover fill ${bg}`);
}
// A shortcut beside a command is plain small text. Only the tutorial card draws a key cap, as it shows a key to press.
for (const r of rules) {
  if (/\bkbd\b/.test(r.selector) && !has(r, ".coach")) assert.ok(!r.props.has("border") && !r.props.has("background"), `${r.selector}: a shortcut is plain text, with no box`);
}

// 6. Motion that motion.check.ts does not cover. An overlay comes in from 0.97 and at most 4 px away, and goes out to
// 0.98. A glyph that pops (the Select tool, a carried option, a tick) starts at 0.85. A ring that spreads (halo) and a
// settle from larger are not entrances.
{
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const m of bare.matchAll(/@keyframes ([\w-]+) \{((?:[^{}]*\{[^{}]*\})*)\s*\}/g)) {
    const [, name, body] = m;
    for (const step of body.matchAll(/(from|to|\d+%)[^{]*\{([^{}]*)\}/g)) {
      const scale = /scale\(([\d.]+)\)|scale: ([\d.]+)/.exec(step[2]), value = scale && Number(scale[1] ?? scale[2]);
      if (value !== null && value < 1 && /opacity: 0[;.]?/.test(step[2]) && !["halo"].includes(name)) {
        if (step[1] === "to") assert.equal(value, 0.98, `@keyframes ${name}: an overlay goes out to 0.98`);
        else assert.ok(value === 0.97 || (value === 0.85 && ["pop", "lift", "coach-tick"].includes(name)), `@keyframes ${name}: starts at ${value}, not 0.97`);
      }
      for (const d of step[2].matchAll(/translate[XY]?\(([^)]*)\)/g)) {
        for (const px of d[1].matchAll(/(?<![\w.%-])-?(\d+)px/g)) assert.ok(Number(px[1]) <= 4 || ["ripple", "home-settle"].includes(name), `@keyframes ${name}: slides ${px[0]}; 4 px is the most`);
      }
    }
  }
}
// The time each kind of overlay takes (tokens.json, motion): menus, lists and panels the short token, bars and panes
// the middle one, dialogs and the tutorial card the long one. Everything leaves on the short token.
const TIME: Record<string, string> = {
  "strip-in": "fast", "list-in": "fast", "page-menu-in": "fast", "paste-offer-in": "fast", "name-in": "fast", "panel-in": "fast", "notice-in": "fast",
  "bar-in": "", "pane-in": "", "view-in": "", "coach-step": "",
  "modal-in": "slow", "coach-in": "slow", "notes-in": "slow",
  "leave": "fast", "panel-out": "fast", "bar-out": "fast", "notice-out": "fast", "fade-out": "fast",
};
for (const r of rules) {
  const animation = r.props.get("animation");
  if (!animation || r.media.some((m) => m.includes("reduced-motion"))) continue;
  for (const part of animation.split(/,(?![^(]*\))/)) {
    const name = /^\s*([\w-]+)/.exec(part)![1];
    if (name in TIME) assert.ok(part.includes(`var(--motion${TIME[name] && "-" + TIME[name]})`), `${r.selector}: ${name} takes var(--motion${TIME[name] && "-" + TIME[name]})`);
  }
}
// Only these change layout as they move, each for a reason: a menu the user drags wider, a fold opening, the Feedback
// pill showing its name, an option landing in its slot, and a scroll bar's thumb (alone on its own layer).
const LAYOUT_MOTION = [".strip", ".fold-body", ".feedback-link", ".feedback-link span", ".carry.land", ".down .scroll-thumb", ".across .scroll-thumb"];
for (const r of rules) {
  const t = r.props.get("transition");
  if (t && /(^|[\s,])(width|height|top|left|right|bottom|padding|margin|gap|max-width|max-height|inset|grid-template-\w+)\s/.test(t)) assert.ok(LAYOUT_MOTION.includes(r.selector), `${r.selector}: transition moves layout (${t}); use transform, translate or opacity`);
}

// 7. Fills. A field is a well (the canvas colour). A button with an edge has the raised fill.
for (const s of [".select-field", ".unit-field", ".segmented", ".list-find", ".page-button"]) assert.ok(rules.some((r) => r.selector === s && r.props.get("background") === "var(--canvas)"), `${s} is a well`);
for (const s of [".spectrum-button", ".chip", ".prop-add", ".dialog-button", ".home-open", ".notes-tab", ".export-button", ".feedback-link", ".actions-reopen"]) assert.ok(rules.some((r) => r.selector === s && r.props.get("background") === "var(--surface-raised)"), `${s} has the raised fill`);

console.log("ui.check: ok");
