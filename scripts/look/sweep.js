// The body of an async function that scripts/look/webkit.swift runs in the app's page. It goes through the app (Home, a
// drawing, the Structure panel, its colour palette and picker, the nickname list, Export… with all pages, the spectrum panel with two tabs, the template library, a caption with the paste
// offer, the Arrow menu's sizes, the Notes panel, every Settings page, the command palette, a Jablonski diagram with a level and a transition
// picked) and lets the app's own watch (src/lookwatch.ts) measure each one.
// It returns JSON: the places it reached, and every "look:" line the watch wrote. Add a place here when the app gets
// a new panel, dialog or page.
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (find, ms = 10000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = find(); if (v) return v; await wait(100); } return null; };
const out = { engine: navigator.userAgent.replace(/^.*\) /, ""), reached: [], missed: [] };
// The watch measures a moment after each click and key: give it one, and the time to settle.
const measure = async (place, there = true) => {
  if (!there) { out.missed.push(place); return; }
  window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
  await wait(1300);
  out.reached.push(place);
};
const key = (init) => { for (const t of [document.activeElement, document.body, window]) t?.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init })); };
const button = (text) => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === text);
const labelled = (label) => document.querySelector(`[aria-label="${label}"]`);

await until(() => document.querySelector(".home, .editor"));
await wait(1200);
if (button("Skip")) await measure("the welcome page"); // the first run only
button("Skip")?.click();
await wait(900);
await measure("Home", !!document.querySelector(".home"));
// Home's example drawings: the Examples page when there are recent drawings (the UI-only preview's ?demo), else the
// Recent section, which shows them all.
const examples = document.querySelector("[data-examples]");
if (examples) {
  examples.click();
  await measure("the Examples page", !!(await until(() => document.querySelector("[data-section='examples'] .home-tile"), 4000)));
  key({ key: "Escape" });
  await wait(600);
} else await measure("Home's examples", !!document.querySelector('.home-tile[data-tile^="example:"]'));
document.querySelector(".home-tile.new")?.click();
await measure("a new drawing", !!(await until(() => document.querySelector(".actions .action"))));
[...document.querySelectorAll(".coach button")].find((b) => /skip/i.test(b.textContent))?.click();
await wait(400);

// A structure by name, so the panels have something to show.
[...document.querySelectorAll(".action")].find((b) => /name to structure/i.test(b.textContent))?.click();
const name = await until(() => document.querySelector("input.name-field"));
await measure("the name field", !!name);
if (name) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(name, "aspirin");
  name.dispatchEvent(new Event("input", { bubbles: true }));
  await wait(2000);
  name.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true, cancelable: true }));
  await wait(2500);
}
if (!labelled("Add a caption")) key({ key: "a", code: "KeyA", metaKey: true });
await measure("the Structure panel", !!(await until(() => labelled("Add a caption"), 4000)));

// The colour rows' palette (every colour as a swatch), then Custom colour… with Save to colours under the picker.
document.querySelector(".colour-row .colour-more")?.click();
await measure("the colour palette", !!(await until(() => document.querySelector(".strip.list .menu-group.swatches"), 3000)));
[...document.querySelectorAll(".strip.list .variant")].find((b) => /Custom colour/.test(b.textContent))?.click();
await measure("the custom colour picker", !!(await until(() => document.querySelector(".colour-pop .picker-save"), 3000)));
key({ key: "Escape" });
await wait(600);

// Choose Nickname (the = key over an atom): the user's nicknames and Octet's, with a field to find one.
const oxygen = [...document.querySelectorAll("svg.canvas text")].find((t) => t.textContent.trim() === "O")?.getBoundingClientRect();
if (oxygen) document.querySelector("svg.canvas")?.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: oxygen.x + oxygen.width / 2, clientY: oxygen.y + oxygen.height / 2 }));
await wait(300);
window.dispatchEvent(new KeyboardEvent("keydown", { key: "=", code: "Equal", bubbles: true, cancelable: true }));
await measure("the nickname list", !!(await until(() => document.querySelector(".nickname-menu .list-find"), 3000)));
key({ key: "Escape" });
await wait(600);

// The Properties panel (a row in the Actions panel): its foot (Add to drawing, Copy report, With names and Decimals)
// in one row, then its Hazards tab.
(labelled("Show the Properties panel") ?? [...document.querySelectorAll(".action")].find((b) => b.textContent.includes("Show the Properties panel")))?.click();
await measure("the Properties panel", !!(await until(() => document.querySelector(".properties .prop-foot"), 4000)));
[...document.querySelectorAll(".properties .prop-tabs button")].find((b) => b.textContent.trim() === "Hazards")?.click();
await measure("the Properties panel's Hazards tab", !!(await until(() => document.querySelector(".properties .prop-hazards"), 3000)));
[...document.querySelectorAll(".properties .prop-tabs button")].find((b) => b.textContent.trim() === "Properties")?.click();
await wait(300);
document.querySelector(".properties .panel-controls button[aria-label='Close']")?.click();
await wait(600);

// Attach Data's dialog, with a field typed in its grid (its empty row then comes under it), in light and in dark.
labelled("Attach data…")?.click();
const grid = await until(() => document.querySelector(".dialog .chart-table input"), 3000);
if (grid) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(grid, "Batch");
  grid.dispatchEvent(new Event("input", { bubbles: true }));
  await wait(300);
  const value = document.querySelector(".dialog .chart-table textarea");
  if (value) { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(value, "B-001\nsecond line"); value.dispatchEvent(new Event("input", { bubbles: true })); }
}
await measure("Attach data", !!grid && document.querySelectorAll(".dialog .chart-table input").length === 2);
document.documentElement.dataset.theme = "dark";
await measure("Attach data, dark", !!grid);
delete document.documentElement.dataset.theme;
key({ key: "Escape" });
await wait(600);

// Export…: PDF with Pages > All pages, the pages as the preview, then One page again.
document.querySelector(".export-button")?.click();
await wait(400);
(await until(() => document.querySelector('.export-menu [data-item="export"]'), 2000))?.click();
const pagesRow = await until(() => labelled("Pages"), 4000);
[...(pagesRow?.querySelectorAll("button") ?? [])].find((b) => b.textContent.trim() === "All pages")?.click();
await measure("Export… with all pages", !!pagesRow && !!(await until(() => document.querySelector(".export-sheets"), 3000)));
[...(pagesRow?.querySelectorAll("button") ?? [])].find((b) => b.textContent.trim() === "One page")?.click();
await wait(300);
key({ key: "Escape" });
await wait(600);

// The spectrum panel: one tab, then two (each with its X, and the + after them).
labelled("Predict ¹³C-NMR shifts")?.click();
await measure("the spectrum panel", !!(await until(() => document.querySelector(".spectrum-controls"), 6000)));
document.querySelector(".tab-add")?.click();
const second = await until(() => document.querySelector(".strip .variant"), 3000);
second?.click();
await wait(1200);
await measure("two spectrum tabs", !!second && document.querySelectorAll(".spectrum-tab").length === 2);
[...document.querySelectorAll(".spectrum .panel-controls button")].find((b) => b.getAttribute("aria-label") === "Minimise")?.click();
await wait(900);
await measure("a minimised panel's pill", !!document.querySelector(".pill"));

// The Arrow tool's menu, with its Large, Medium and Small across the top: Large chosen, the fill come to rest on it,
// in light and in dark.
const arrowTool = [...document.querySelectorAll(".tool")].find((t) => /arrow/i.test(t.getAttribute("aria-label") ?? ""));
arrowTool?.click(); await wait(500); arrowTool?.click();
const sizes = await until(() => document.querySelector('.strip[data-tool="arrow"] .menu-segments .segmented'), 3000);
[...(sizes?.querySelectorAll("button") ?? [])].find((b) => b.textContent.trim() === "Large")?.click();
await wait(600);
const fillOn = () => { const on = sizes?.querySelector('[aria-checked="true"]'), fill = sizes?.querySelector(".seg-thumb"); if (!on || !fill) return false; const a = on.getBoundingClientRect(), b = fill.getBoundingClientRect(); return Math.abs(a.left - b.left) < 1 && Math.abs(a.width - b.width) < 1 && on.textContent.trim() === "Large"; };
await measure("the Arrow menu's sizes", !!sizes && fillOn());
document.documentElement.dataset.theme = "dark";
await measure("the Arrow menu's sizes, dark", !!sizes && fillOn());
delete document.documentElement.dataset.theme;
[...(sizes?.querySelectorAll("button") ?? [])].find((b) => b.textContent.trim() === "Small")?.click();
await wait(300);
key({ key: "Escape" });
await wait(400);

// The template library, from the ring tool's menu.
const ring = [...document.querySelectorAll(".tool")].find((t) => /benzene|ring/i.test(t.getAttribute("aria-label") ?? ""));
ring?.click(); await wait(500); ring?.click();
const templates = await until(() => document.querySelector('.variant[aria-haspopup="dialog"]'), 3000);
await measure("a tool's menu", !!templates);
templates?.click();
await measure("the template library", !!(await until(() => document.querySelector(".segmented.library-kind"), 4000)));
key({ key: "Escape" });
await wait(600);
// The Template tool's library, with the template in hand drawn large to choose where it attaches.
const template = [...document.querySelectorAll(".tool")].find((t) => /templates$/i.test(t.getAttribute("aria-label") ?? ""));
template?.click(); await wait(500); template?.click();
await measure("the template library's Attach by", !!(await until(() => document.querySelector(".library-attach .attach-hit"), 4000)));
key({ key: "Escape" });
await wait(600);

// A caption, and the offer that comes when a reference is pasted into it with its formatting.
key({ key: "a", code: "KeyA", metaKey: true });
await wait(800);
labelled("Add a caption")?.click();
const caption = await until(() => document.querySelector(".caption-box"), 4000);
if (caption) {
  caption.focus(); getSelection().selectAllChildren(caption); getSelection().collapseToEnd();
  const data = new DataTransfer();
  data.setData("text/plain", "Smith, J. et al. J. Am. Chem. Soc. 2021, 143, 1234.");
  data.setData("text/html", "Smith, J. et al. <i>J. Am. Chem. Soc.</i> <b>2021</b>, <i>143</i>, 1234.");
  caption.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: data }));
}
await measure("the paste offer", !!(await until(() => document.querySelector(".paste-offer"), 4000)));
key({ key: "Escape" });
await wait(600);

// The Notes panel (Object > Annotate…), with a note of several lines on the selection.
key({ key: "a", code: "KeyA", metaKey: true });
await wait(800);
labelled("Annotate…")?.click();
// (Annotate… puts the cursor in the selection's note; leaving it uses what was typed.)
const note = await until(() => (document.activeElement?.matches(".note-panel textarea") ? document.activeElement : null), 4000);
if (note) { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(note, "Entry 7\nbatch 2\nfrom the old bottle"); note.dispatchEvent(new Event("input", { bubbles: true })); }
await measure("the Notes panel", !!note);
note?.blur();
await wait(400);

// Every Settings page.
document.querySelector(".actions-reopen")?.click();
await wait(600);
document.querySelector(".actions-settings")?.click();
await wait(1000);
const pages = [...document.querySelectorAll(".module")];
await measure("Settings", pages.length > 0);
for (const page of pages) { page.click(); await wait(500); await measure(`Settings, ${page.textContent.trim()}`); }
document.querySelector(".settings-window .actions-close")?.click();
await wait(600);

// The command palette (this key opens it in a browser; the app has it in a menu).
key({ key: "a", code: "KeyA", metaKey: true, shiftKey: true });
await measure("the command palette", !!(await until(() => document.querySelector(".command-palette"), 3000)));

// A Jablonski diagram from the palette (picked whole), then one of its levels and one of its transitions picked alone
// (a double-click, as on any part of a group), each with its own controls in the Actions panel.
key({ key: "Escape" });
await wait(500);
[...document.querySelectorAll(".tool")].find((t) => /^select/i.test(t.getAttribute("aria-label") ?? ""))?.click();
key({ key: "a", code: "KeyA", metaKey: true, shiftKey: true });
const find = await until(() => document.querySelector(".command-palette input"), 3000);
if (find) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(find, "Jablonski diagram");
  find.dispatchEvent(new Event("input", { bubbles: true }));
  await wait(400);
  find.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true, cancelable: true }));
}
await measure("a Jablonski diagram", !!(await until(() => labelled("Add a singlet"), 4000)));
// Each part's place on screen from the selection's marks, in the parts' order: S0 and its vibrational levels, S1 and
// its (the fifth mark is S1), and so on, then the transitions (the twentieth is fluorescence).
const world = document.getElementById("world"), marks = [...document.querySelectorAll(".selection-marks .arrow-mark")];
const middle = (k) => { const ps = marks[k]?.getAttribute("points").trim().split(/\s+/).map((q) => new DOMPoint(...q.split(",").map(Number)).matrixTransform(world.getScreenCTM())); return ps && [(ps[0].x + ps[ps.length - 1].x) / 2, (ps[0].y + ps[ps.length - 1].y) / 2]; };
const press = (type, [x, y]) => document.elementFromPoint(x, y)?.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: type === "pointerup" ? 0 : 1, pointerId: 1, pointerType: "mouse", isPrimary: true }));
const twice = async (p) => { for (let k = 0; k < 2; k++) { press("pointerdown", p); press("pointerup", p); await wait(80); } document.elementFromPoint(...p)?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, clientX: p[0], clientY: p[1], detail: 2 })); await wait(300); };
const [level, transition] = [middle(4), middle(19)];
if (level) await twice(level);
await measure("a Jablonski diagram's level", !!(await until(() => labelled("Vibrational levels"), 3000)));
if (transition) await twice(transition);
await measure("a Jablonski diagram's transition", !!(await until(() => [...document.querySelectorAll(".pick-button")].some((b) => /^Kind/.test(b.getAttribute("aria-label") ?? "")), 3000)));

out.look = window.__look;
out.errors = window.__errors.slice(0, 10);
return JSON.stringify(out);
