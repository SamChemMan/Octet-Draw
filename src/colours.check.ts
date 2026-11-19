// Run: node src/colours.check.ts. Fails if Octet's colours stop being one system: every colour menu with the same parts
// in the same order, each colour once, the user's own colours moved and added right, the pinned colours of each colour
// row, the eyedropper's colours read right, and every place that offers colours using the one menu.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ADD, addColour, chosenKey, colourName, colourOptions, elementColoursOn, hexOf, moveColour, OWN_MOST, ownIndex, PICK, pin, PIN_MOST, pinned, pinsOf, unpin } from "./colours.ts";
import { COLOURS, HIGHLIGHT_COLOURS, RING_FILLS } from "./docstyle.ts";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const own = [{ name: "Lab red", hex: "#C0392B" }, { name: "Paper teal", hex: "#127A7A" }];
const drawing = [{ name: "#127A7A", hex: "#127a7a" }, { name: "#2F6FED", hex: "#2F6FED" }, { name: "#ABCDEF", hex: "#ABCDEF" }];

// The parts, in order: None (where it applies) and the presets, the user's own, the drawing's, then the eyedropper and
// the picker. A colour shows once, at its first place: the drawing's teal is the user's, its blue is Highlight's Blue.
const groups = colourOptions(HIGHLIGHT_COLOURS, own, drawing, "none", true);
assert.equal(groups.length, 4);
assert.deepEqual(groups[0][0], { key: "none", name: "None" });
assert.deepEqual(groups[0].slice(1).map((o) => o.hex), HIGHLIGHT_COLOURS.map(([, h]) => h));
assert.deepEqual(groups[1].map((o) => [o.key, o.name]), [["o0", "Lab red"], ["o1", "Paper teal"]]);
assert.deepEqual(groups[2].map((o) => [o.key, o.hex]), [["d2", "#ABCDEF"]], "the drawing's colours that are in no other group");
assert.deepEqual(groups[3].map((o) => [o.key, o.name]), [[PICK, "Pick from screen"], [ADD, "Custom colour…"]]);
assert.equal(new Set(groups.flat().map((o) => o.key)).size, groups.flat().length, "every option has its own key");
const hexes = groups.flat().flatMap((o) => (o.hex ? [o.hex.toLowerCase()] : []));
assert.equal(new Set(hexes).size, hexes.length, "every colour once");
assert.equal(chosenKey(groups, "none"), "none");
// The user's colour that is one of Octet's shows once, as Octet's.
assert.deepEqual(colourOptions(COLOURS, [{ name: "Mine", hex: "#000000" }], [], "#000000")[1], []);
// Ink colours have no None. The colour chosen now is ringed once; one in no group joins Octet's, by its hex.
const ink = colourOptions(COLOURS, own, [], "#127A7A");
assert.ok(!ink[0].some((o) => o.key === "none"));
assert.equal(chosenKey(ink, "#127a7a"), "o1");
const odd = colourOptions(COLOURS, own, [], "#123456");
assert.deepEqual(odd[0].at(-1), { key: "#123456", name: "#123456", hex: "#123456" });
assert.equal(chosenKey(odd, "#123456"), "#123456");
assert.equal(colourOptions(COLOURS, own, [], "#000000")[0].length, COLOURS.length, "a preset is not added again");
// A colour's name: the menu's, the user's, the drawing's or Octet's other lists, else its hex.
assert.equal(colourName("#2f6fed", HIGHLIGHT_COLOURS), "Blue");
assert.equal(colourName("#127a7a", COLOURS, own), "Paper teal");
assert.equal(colourName("#B42323", HIGHLIGHT_COLOURS), "Red", "named from Octet's ink colours in the Highlight menu too");
assert.equal(colourName("#abcdef", COLOURS), "#ABCDEF");
assert.equal(colourName("none", RING_FILLS), "None");

// The user's own colours: an option's place in them, moved, and a colour added once, up to OWN_MOST.
assert.equal(ownIndex("o1", own), 1);
assert.equal(ownIndex("o2", own), -1);
assert.equal(ownIndex("d0", own), -1, "the drawing's colours are not the user's to change");
assert.deepEqual(moveColour([...own, { name: "C", hex: "#000001" }], 2, 0).map((c) => c.name), ["C", "Lab red", "Paper teal"]);
assert.deepEqual(moveColour(own, 0, 1).map((c) => c.name), ["Paper teal", "Lab red"]);
assert.equal(addColour(own, "#c0392b"), own, "a colour the user has already is not added again");
assert.deepEqual(addColour(own, "#010203").at(-1), { name: "Colour 3", hex: "#010203" });
const full = Array.from({ length: OWN_MOST }, (_, k) => ({ name: `C${k}`, hex: `#${(k + 1).toString(16).padStart(6, "0")}` }));
assert.equal(addColour(full, "#FFFFFF").length, OWN_MOST);
// A hundred of the user's own colours stay one group, in their order (the menu shows two rows and a swatch for the rest).
assert.deepEqual(colourOptions(COLOURS, full, [], "#000000")[1].map((o) => o.name), full.map((c) => c.name));

// Pinned colours: Octet's first ones for each kind of row until the user pins one; a pin goes at the end, in the last
// place when the row is full; each once, whatever its case; unpinned at once.
assert.deepEqual(pinsOf({}, "ink"), COLOURS.slice(0, PIN_MOST).map(([, h]) => h));
assert.deepEqual(pinsOf({}, "highlight", PIN_MOST - 1), HIGHLIGHT_COLOURS.slice(0, PIN_MOST - 1).map(([, h]) => h), "None takes a place in a row that has it");
assert.deepEqual(pinsOf({ ink: ["#123456"] }, "ink"), ["#123456"]);
assert.deepEqual(pin(["#000000"], "#123456"), ["#000000", "#123456"]);
const row = pinsOf({}, "ink");
assert.deepEqual(pin(row, "#123456"), [...row.slice(0, PIN_MOST - 1), "#123456"], "a full row keeps its first colours");
assert.equal(pin(row, row[0].toLowerCase()), row, "pinned already");
assert.deepEqual(unpin(row, row[1].toLowerCase()), [row[0], ...row.slice(2)]);
assert.ok(pinned(row, row[2].toLowerCase()) && !pinned(row, "#123456") && !pinned(row, undefined));

// The colours the eyedropper reads from the page, as #RRGGBB; nothing for none, a clear colour or a gradient.
assert.equal(hexOf("rgb(255, 0, 16)"), "#FF0010");
assert.equal(hexOf("rgba(18, 52, 86, 0.4)"), "#123456");
assert.equal(hexOf("rgb(18 52 86 / 0.5)"), "#123456");
assert.equal(hexOf("rgba(0, 0, 0, 0)"), undefined);
assert.equal(hexOf("none"), undefined);
assert.equal(hexOf('url("#shade3")'), undefined);
assert.equal(hexOf("#abcdef"), "#ABCDEF");

// Every place that offers colours uses the one menu: the Actions panel's colour rows (Colour, Highlight, Ring fill) and
// its right-click menu, Settings' text colour, the text sheet and a folder on Home. The picker has the eyedropper.
const actions = read("./Actions.tsx"), settings = read("./SettingsWindow.tsx"), home = read("./Home.tsx"), picker = read("./ColourPicker.tsx"), css = read("./editor.css");
for (const label of ["Colour", "Highlight", "Ring fill"]) assert.match(actions, new RegExp(`<ColourPick strip label="${label}"`), label);
assert.match(actions, /colourItems\(colourOptions\(/, "the right-click menu's Colour");
assert.match(read("./DetailsSheet.tsx"), /<ColourPick label="Colour"/);
// In Settings it is drawn as the fields beside it, with the colour's name where a select shows its value.
assert.match(settings, /<ColourPick field label="Text colour"/);
assert.match(picker, /className=\{field \? "select-field" : strip \? "chip colour-more" : "chip pick-button"\}/);
// Every colour in a colour menu is the one swatch (.swatch), as in Settings and the Spectrum, in a grid of them.
assert.match(picker, /swatch: o\.key !== PICK && o\.key !== ADD/);
assert.match(read("./Menu.tsx"), /className=\{swatchGroup\(g\) \? "menu-group swatches" : "menu-group"\}/);
assert.doesNotMatch(css, /\.pick-swatch \{[^}]*opacity/, "a swatch shows the colour as it is");
// Save to colours keeps the picker open; closing it saves nothing by itself (no auto-add on close anywhere).
assert.match(picker, /Save to colours/);
assert.doesNotMatch(picker + home, /onClose=\{[^}]*addColour/);
assert.match(home, /colourItems\(colourOptions\(COLOURS/);
assert.ok(!/className="swatches small"|"\\u0000custom"/.test(actions + home), "no colour row of its own");
assert.match(picker, /aria-label="Pick from screen"[^\n]+pickColour\(\)/, "the picker's eyedropper");
// Every colour command stays, and the user's colours all have one (colour_user_N), in the app's Colour menu too.
const editor = read("./Editor.tsx"), menu = read("../src-tauri/src/main.rs");
for (const command of ["colour_${k}", "colour_user_${k}", "highlight_${k}", "ringfill_${k}", "colour_pick: ", "colours_add: ", "colour_other: "]) assert.ok(editor.includes(command), command);
assert.match(editor, /length: OWN_MOST \+ 24 \}, \(_, k\) => \[`colour_user_\$\{k\}`/);
assert.ok(menu.includes(`names.into_iter().take(${OWN_MOST + 24})`), "main.rs lists every user colour and the drawing's 24");
assert.match(menu, /item\("colour_pick", "Pick from Screen", ""\)/);
assert.match(menu, /eyedropper::pick_colour/);
// A colour changed in the picker is one step to undo, for ink as for highlights and ring fills.
assert.match(editor, /const \[hex, drag\] = command\.slice\(7\)\.split\("\."\)/);
assert.match(actions, /run\(`colour\.\$\{hex\}\$\{live \? "\.drag" : ""\}`\)/);
// A pinned colour is one click. The window's eyedropper takes the keys first, so Escape does not close Settings or a
// dialog under it. A long right-click colour list scrolls. Saved files take the user's first 20 colours, as before
// OWN_MOST, so a drawing's own palette keeps its room. Off X11 the screen is not read.
assert.match(picker, /onClick=\{\(\) => \{ if \(!on\) onPick\(hex\); \}\}/);
const menus = read("./Menu.tsx");
assert.match(menus, /listOpen = \(\) => [^\n]*\.eyedropper/);
assert.match(menus, /addEventListener\("wheel", away, true\)/);
assert.match(editor, /const mine = settings\.palette\.slice\(0, 20\)/);
assert.match(read("../src-tauri/src/eyedropper.rs"), /type_\(\)\.name\(\) != "GdkX11Display"/);

// Colour by Element is a toggle (docs/plans/charts.md, H1): on only when every heteroatom in scope has its element's
// colour. A carbon's own colour does not count, and neither does an atom outside the selection.
{
  const by = { N: "#2F6FED", O: "#E5484D" }, all = new Set([0, 1, 2, 3]);
  const atoms = [{ label: "C", colour: "#123456" }, { label: "N" }, { label: "O" }, { label: "C" }];
  assert.equal(elementColoursOn(atoms, all, by), false, "nothing coloured yet");
  assert.equal(elementColoursOn([atoms[0], { label: "N", colour: "#2f6fed" }, { label: "O", colour: "#E5484D" }, atoms[3]], all, by), true, "every heteroatom has its colour, in any case of letters");
  assert.equal(elementColoursOn([atoms[0], { label: "N", colour: "#2F6FED" }, { label: "O", colour: "#00FF00" }, atoms[3]], all, by), false, "one in another colour");
  assert.equal(elementColoursOn([atoms[0], { label: "N", colour: "#2F6FED" }, { label: "O" }, atoms[3]], new Set([0, 1]), by), true, "only the selection counts");
  assert.equal(elementColoursOn(atoms, new Set([0, 3]), by), false, "no heteroatom in scope");
  assert.match(editor, /on = elementColoursOn\(doc\.atoms, atoms, by\)/);
}
