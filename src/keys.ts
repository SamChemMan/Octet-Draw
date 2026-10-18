// Keyboard shortcuts. Each action works in one place: over an atom, over a bond, or anywhere else.
// The same key can do different things in different places (n over an atom, 2 over a bond), as in ChemDraw.
// The defaults are ChemDraw's hotkeys, as ChemDraw 22.2 sets them (its hotkey table and its Atom and Generic Hotkeys
// help), so a ChemDraw user's hands already know them. The user's changes sit on top.

// item: over an atom or a bond.
export type Place = "atom" | "bond" | "item" | "any";
export type Group = "Atoms" | "Groups" | "Bonds" | "Tools" | "Selection" | "Edit";
// group: one of Group for the canvas keys; for a menu command, the menu it is in (File, Object › Align).
export type Action = { id: string; name: string; group: Group | string; place: Place };

const element = (symbol: string, name: string): Action => ({ id: `element.${symbol}`, name: `Set atom to ${name}`, group: "Atoms", place: "atom" });
const group = (id: string, name: string): Action => ({ id: `group.${id}`, name, group: "Groups", place: "atom" });
const bond = (id: string, name: string): Action => ({ id: `bond.${id}`, name, group: "Bonds", place: "bond" });
const any = (id: string, name: string, g: Group): Action => ({ id, name, group: g, place: "any" });

export const ACTIONS: Action[] = [
  element("C", "carbon"), element("H", "hydrogen"), element("N", "nitrogen"), element("O", "oxygen"), element("S", "sulfur"),
  element("P", "phosphorus"), element("F", "fluorine"), element("Cl", "chlorine"), element("Br", "bromine"), element("I", "iodine"),
  element("B", "boron"), element("Si", "silicon"), element("Li", "lithium"),
  { id: "atom.label", name: "Type a label on the atom", group: "Atoms", place: "atom" },
  { id: "atom.newlabel", name: "Type a new label on the atom", group: "Atoms", place: "atom" },
  { id: "atom.sproutlabel", name: "Add a bond and type a label on its end", group: "Atoms", place: "atom" },
  ...["Me", "Et", "Ph", "Ac", "OMe", "CO2Me", "CF3", "NO2", "N3", "MgBr", "Fmoc", "Cbz", "Boc", "D", "R", "X"].map((t): Action => ({ id: `label.${t}`, name: `Set atom to ${t}`, group: "Atoms", place: "atom" })),
  { id: "atom.attach", name: "Add an attachment point", group: "Atoms", place: "atom" },
  { id: "atom.number", name: "Show or hide the atom's number", group: "Atoms", place: "atom" },
  { id: "atom.properties", name: "Atom properties", group: "Atoms", place: "atom" },
  { id: "charge.plus", name: "Add a positive charge", group: "Atoms", place: "atom" },
  { id: "charge.minus", name: "Add a negative charge", group: "Atoms", place: "atom" },
  group("chain", "Add a bond (zig-zag)"), group("other", "Add a bond the other way"), group("acetyl", "Add an acetyl, or make C=O"),
  group("phenyl", "Add a phenyl"), group("wedgeMe", "Add a wedged methyl"), group("hashMe", "Add a hashed methyl"),
  group("cyclohexyl", "Add a cyclohexyl"), group("cyclopentyl", "Add a cyclopentyl"), group("cyclobutyl", "Add a cyclobutyl"),
  group("cyclopropyl", "Add a cyclopropyl"), group("methylidene", "Add =CH2"), group("dimethyl", "Add two methyls"), group("alkyne", "Add an alkyne"),
  group("cpLigand", "Add a cyclopentadienyl ligand (η5)"), group("phenylLigand", "Add a phenyl ligand (η6)"),
  group("sulfonyl", "Add a sulfonyl"), group("tBu", "Add a tert-butyl"),
  bond("single", "Make bond single"), bond("double", "Make bond double"), bond("triple", "Make bond triple"), bond("bolddouble", "Make bond bold double"), bond("dasheddouble", "Make bond dashed double"), bond("aromaticdouble", "Make bond aromatic double"), bond("eitherdouble", "Make bond double either"),
  bond("wedge", "Make bond a wedge"), bond("hashwedge", "Make bond a hashed wedge"), bond("hashed", "Make bond hashed"),
  bond("bold", "Make bond bold"), bond("dashed", "Make bond dashed"), bond("wavy", "Make bond wavy"),
  bond("front", "Bring the bond to the front, where bonds cross"),
  bond("left", "Put the double bond's second line on the left"), bond("centre", "Centre the double bond"), bond("right", "Put the double bond's second line on the right"),
  bond("ring3", "Fuse a cyclopropane"), bond("ring4", "Fuse a cyclobutane"), bond("ring5", "Fuse a cyclopentane"), bond("ring6", "Fuse a cyclohexane"),
  bond("ring7", "Fuse a cycloheptane"), bond("ring8", "Fuse a cyclooctane"), bond("ring9", "Fuse a cyclononane"), bond("ring10", "Fuse a cyclodecane"),
  bond("benzene", "Fuse a benzene"), bond("cyclopentadiene", "Fuse a cyclopentadiene"),
  bond("chair1", "Fuse a chair cyclohexane"), bond("chair2", "Fuse a chair cyclohexane, other way up"),
  any("tool.select", "Select tool", "Tools"), any("tool.bond", "Bond tool", "Tools"), any("tool.chain", "Chain tool", "Tools"),
  any("tool.ring", "Ring tool", "Tools"), any("tool.benzene", "Benzene tool", "Tools"), any("tool.cyclopentadiene", "Cyclopentadiene tool", "Tools"),
  any("tool.cyclohexane", "Cyclohexane tool", "Tools"), any("tool.cyclopentane", "Cyclopentane tool", "Tools"), any("tool.erase", "Eraser tool", "Tools"), any("tool.text", "Text tool", "Tools"), any("tool.arrow", "Arrow tool", "Tools"),
  any("tool.template", "Template tool", "Tools"), any("tool.symbol", "Symbols tool", "Tools"), any("tool.shape", "Shape tool", "Tools"),
  any("tool.bracket", "Bracket tool", "Tools"), any("tool.tlc", "TLC plate tool", "Tools"), any("tool.orbital", "Orbital tool", "Tools"),
  { id: "select.here", name: "Select the atom or bond under the pointer", group: "Selection", place: "item" },
  any("eraser.smaller", "Make the eraser smaller", "Tools"), any("eraser.bigger", "Make the eraser bigger", "Tools"),
  any("nudge.left", "Move the selection left 1 pt, or the highlight one step left", "Selection"), any("nudge.right", "Move the selection right 1 pt, or the highlight one step right", "Selection"),
  any("nudge.up", "Move the selection up 1 pt, or the highlight one step up", "Selection"), any("nudge.down", "Move the selection down 1 pt, or the highlight one step down", "Selection"),
  any("nudge.left10", "Move the selection left 10 pt, or the highlight about three bonds left", "Selection"), any("nudge.right10", "Move the selection right 10 pt, or the highlight about three bonds right", "Selection"),
  any("nudge.up10", "Move the selection up 10 pt, or the highlight about three bonds up", "Selection"), any("nudge.down10", "Move the selection down 10 pt, or the highlight about three bonds down", "Selection"),
  any("rotate.ccw15", "Turn the selection 15° anticlockwise", "Selection"), any("rotate.cw15", "Turn the selection 15° clockwise", "Selection"),
  any("rotate.ccw1", "Turn the selection 1° anticlockwise", "Selection"), any("rotate.cw1", "Turn the selection 1° clockwise", "Selection"),
  any("tilt.left", "Turn the selection 12° in 3D to the left, or move the highlight to the next structure left", "Selection"),
  any("tilt.right", "Turn the selection 12° in 3D to the right, or move the highlight to the next structure right", "Selection"),
  any("tilt.up", "Turn the selection 12° in 3D up, or move the highlight to the next structure up", "Selection"),
  any("tilt.down", "Turn the selection 12° in 3D down, or move the highlight to the next structure down", "Selection"),
  any("edit.delete", "Delete the selection, or what is under the pointer", "Edit"),
  // ChemDraw's reaction shortcut: a reaction arrow and a copy of the selected structures beyond it, that way.
  any("reaction.right", "Add a reaction arrow and a copy of the selection to the right", "Selection"), any("reaction.left", "Add a reaction arrow and a copy of the selection to the left", "Selection"),
  any("reaction.up", "Add a reaction arrow and a copy of the selection above", "Selection"), any("reaction.down", "Add a reaction arrow and a copy of the selection below", "Selection"),
];

// ChemDraw's defaults. Where its table and its help disagree (Boc: y or Shift+Y), both keys work.
export const DEFAULT_KEYS: Record<string, string[]> = {
  "element.C": ["c"], "element.H": ["h"], "element.N": ["n", "w"], "element.O": ["o", "q"], "element.S": ["s"], "element.P": ["p"],
  "element.F": ["f"], "element.Cl": ["l", "shift+c"], "element.Br": ["b"], "element.I": ["i"], "element.B": ["shift+b"],
  "element.Si": ["shift+s"], "element.Li": ["shift+l"],
  "atom.label": ["enter"], "atom.newlabel": ["!"], "atom.sproutlabel": [">"],
  "label.Me": ["m"], "label.Et": ["e"], "label.Ph": ["shift+p"], "label.Ac": ["shift+a"], "label.OMe": ["shift+o"], "label.CO2Me": ["shift+e"],
  "label.CF3": ["shift+f"], "label.NO2": ["shift+n"], "label.N3": ["shift+z"], "label.MgBr": ["shift+m"], "label.Fmoc": ["shift+q"],
  "label.Cbz": ["shift+h"], "label.Boc": ["y", "shift+y"], "label.D": ["d"], "label.R": ["r"], "label.X": ["x"], "atom.attach": ["."], "atom.number": ["'"], "atom.properties": ["/", "?"], "select.here": ["g"],
  "charge.plus": ["+"], "charge.minus": ["-"],
  "group.chain": ["1"], "group.other": ["0"], "group.acetyl": ["2"], "group.phenyl": ["3", "a"], "group.wedgeMe": ["4"], "group.hashMe": ["5"],
  "group.cyclohexyl": ["6"], "group.cyclopentyl": ["7"], "group.methylidene": ["8"], "group.dimethyl": ["9"], "group.alkyne": ["z"],
  "group.cpLigand": ["j"], "group.phenylLigand": ["shift+j"],
  "group.cyclopropyl": ["v"], "group.cyclobutyl": ["u"], "group.sulfonyl": ["k"], "group.tBu": ["shift+k"],
  "bond.single": ["1"], "bond.double": ["2"], "bond.triple": ["3"], "bond.wedge": ["w"], "bond.hashwedge": ["h", "shift+w"],
  "bond.hashed": ["shift+h"], "bond.bold": ["b"], "bond.bolddouble": ["shift+b"], "bond.dasheddouble": ["shift+d"], "bond.aromaticdouble": [], "bond.eitherdouble": [], "bond.dashed": ["d"], "bond.wavy": ["y"],
  "bond.left": ["l"], "bond.centre": ["c"], "bond.right": ["r"], "bond.front": ["f"],
  "bond.ring3": ["v"], "bond.ring4": ["4"], "bond.ring5": ["5"], "bond.ring6": ["6"], "bond.ring7": ["7"], "bond.ring8": ["8"],
  "bond.ring9": [], "bond.ring10": [], "bond.benzene": ["a"], "bond.cyclopentadiene": ["z"], "bond.chair1": ["9"], "bond.chair2": ["0"],
  "tool.select": ["space"], "tool.bond": ["x"], "tool.chain": ["shift+x"], "tool.ring": [], "tool.benzene": ["j"],
  "tool.cyclopentadiene": ["shift+j"], "tool.cyclohexane": [], "tool.cyclopentane": [], "tool.erase": [], "tool.text": ["t"], "tool.arrow": ["e"], "tool.template": [], "tool.symbol": ["shift+e"], "tool.shape": [],
  "tool.bracket": ["shift+t"], "tool.tlc": ["g"], "tool.orbital": ["shift+g"],
  "eraser.smaller": ["["], "eraser.bigger": ["]"],
  "nudge.left": ["arrowleft"], "nudge.right": ["arrowright"], "nudge.up": ["arrowup"], "nudge.down": ["arrowdown"],
  "nudge.left10": ["shift+arrowleft"], "nudge.right10": ["shift+arrowright"], "nudge.up10": ["shift+arrowup"], "nudge.down10": ["shift+arrowdown"],
  "rotate.ccw15": ["alt+arrowup"], "rotate.cw15": ["alt+arrowdown"], "rotate.ccw1": ["alt+arrowleft"], "rotate.cw1": ["alt+arrowright"],
  "tilt.left": ["alt+shift+arrowleft"], "tilt.right": ["alt+shift+arrowright"], "tilt.up": ["alt+shift+arrowup"], "tilt.down": ["alt+shift+arrowdown"],
  "edit.delete": ["delete", "backspace"],
  "reaction.right": ["mod+arrowright"], "reaction.left": ["mod+arrowleft"], "reaction.up": ["mod+arrowup"], "reaction.down": ["mod+arrowdown"],
};

export type Keymap = Record<string, string[]>;
export const keymap = (changes: Keymap = {}): Keymap => ({ ...DEFAULT_KEYS, ...changes });

// One key press as a string: "n", "shift+n", "+", "shift+arrowup", "alt+arrowleft". Letters and named keys keep
// Shift; symbols such as + are already shifted. Option changes the letter a key types on a Mac, so the
// physical key (e.code) is used whenever Option is held.
export function keyOf(e: { key: string; code?: string; shiftKey: boolean; altKey: boolean; metaKey: boolean; ctrlKey: boolean }): string | undefined {
  if (["Shift", "Alt", "Meta", "Control", "CapsLock", "Dead"].includes(e.key)) return undefined;
  let key = e.key === " " ? "space" : e.key.toLowerCase();
  if (e.altKey && e.code?.startsWith("Key")) key = e.code.slice(3).toLowerCase();
  const named = key.length > 1;
  // On the Mac, Command is mod and Control its own key (⌃⌘E is not ⌘E); elsewhere Ctrl is mod.
  const mods = [(MAC ? e.metaKey : e.metaKey || e.ctrlKey) && "mod", MAC && e.ctrlKey && "ctrl", e.altKey && "alt", e.shiftKey && (/^[a-z]$/.test(key) || named) && "shift"].filter(Boolean);
  return [...mods, key].join("+");
}

// How a key looks on screen.
const MAC = typeof navigator !== "undefined" && navigator.platform.startsWith("Mac");
const NAMES: Record<string, string> = {
  delete: "Delete", backspace: MAC ? "⌫" : "Backspace", space: "Space", escape: "Esc", enter: MAC ? "↩" : "Enter", "-": "−",
  arrowleft: "←", arrowright: "→", arrowup: "↑", arrowdown: "↓",
};
// A shortcut written the Mac way (⇧⌥⌘L, or ⇧Ctrl+L from code that puts Ctrl+ for ⌘ off the Mac) as this platform
// shows it: unchanged on the Mac; on Windows and Linux, Ctrl+Alt+Shift+L, in that order.
export function platformLabel(s: string | undefined): string | undefined {
  if (MAC || !s) return s;
  const MODS: Record<string, string> = { "⌃": "Ctrl", "⌥": "Alt", "⇧": "Shift", "⌘": "Ctrl", "Ctrl+": "Ctrl", "Alt+": "Alt", "Shift+": "Shift" };
  const mods = new Set<string>();
  let rest = s;
  for (let m = /^(⌃|⌥|⇧|⌘|Ctrl\+|Alt\+|Shift\+)/.exec(rest); m && rest.length > m[1].length; m = /^(⌃|⌥|⇧|⌘|Ctrl\+|Alt\+|Shift\+)/.exec(rest)) {
    mods.add(MODS[m[1]]);
    rest = rest.slice(m[1].length);
  }
  const key = ({ "⌫": "Backspace", "⌦": "Delete", "↩": "Enter", "⎋": "Esc" } as Record<string, string>)[rest] ?? rest;
  return [...["Ctrl", "Alt", "Shift"].filter((k) => mods.has(k)), key].join("+");
}

// A key as this platform writes it: ⌃⌥⇧⌘ before the key on the Mac, in that order; Ctrl+Alt+Shift+ elsewhere.
export function label(key: string): string {
  if (key === "+") return "+";
  const parts = key.split("+"), last = parts.pop()!, mods = new Set(parts), name = NAMES[last] ?? (last.length === 1 ? last.toUpperCase() : last);
  if (MAC) return [["ctrl", "⌃"], ["alt", "⌥"], ["shift", "⇧"], ["mod", "⌘"]].filter(([m]) => mods.has(m)).map(([, g]) => g).join("") + name;
  return [...(mods.has("mod") || mods.has("ctrl") ? ["Ctrl"] : []), ...(mods.has("alt") ? ["Alt"] : []), ...(mods.has("shift") ? ["Shift"] : []), name].join("+");
}

// Menu commands (src-tauri/src/main.rs lists them): each is an action "menu.<id>" whose default is the menu's own
// shortcut, so Settings lists and changes them with the canvas keys. A shortcut with Command or Ctrl is the menu's
// (native: it works wherever the focus is, as menus do); any other key the page handles, never while typing.
const ACCEL: Record<string, string> = { space: "Space", enter: "Enter", backspace: "Backspace", delete: "Delete", escape: "Escape", tab: "Tab", arrowup: "Up", arrowdown: "Down", arrowleft: "Left", arrowright: "Right" };
export function fromAccelerator(a: string): string | undefined {
  if (!a) return undefined;
  const parts = a.split("+"), key = parts.pop()!.toLowerCase(), mods = new Set(parts.map((p) => p.toLowerCase()));
  const name = Object.entries(ACCEL).find(([, v]) => v.toLowerCase() === key)?.[0] ?? (key === "" ? "+" : key);
  return [mods.has("cmdorctrl") || mods.has("cmd") || mods.has("command") ? "mod" : "", mods.has("ctrl") || mods.has("control") ? (MAC ? "ctrl" : "mod") : "", mods.has("alt") || mods.has("option") ? "alt" : "", mods.has("shift") ? "shift" : ""]
    .filter((m, k, all) => m && all.indexOf(m) === k).concat(name).join("+");
}
export const native = (key: string) => /(^|\+)(mod|ctrl)\+/.test(key);
export function toAccelerator(key: string): string {
  const parts = key.split("+"), last = parts.pop()!, mods = new Set(parts);
  const name = ACCEL[last] ?? (/^f\d{1,2}$/.test(last) ? last.toUpperCase() : last.length === 1 ? last.toUpperCase() : last);
  return [mods.has("mod") ? "CmdOrCtrl" : "", mods.has("ctrl") ? "Ctrl" : "", mods.has("alt") ? "Alt" : "", mods.has("shift") ? "Shift" : "", name].filter(Boolean).join("+");
}
export function registerMenu(items: [string, string, string, string][]) {
  // A command no longer in the menu (the Search menu, with Online search off) leaves the list.
  const ids = new Set(items.map(([id]) => `menu.${id}`));
  for (let k = ACTIONS.length - 1; k >= 0; k--) if (ACTIONS[k].id.startsWith("menu.") && !ids.has(ACTIONS[k].id)) ACTIONS.splice(k, 1);
  for (const [id, name, section, keys] of items) {
    const action = `menu.${id}`;
    if (!ACTIONS.some((a) => a.id === action)) ACTIONS.push({ id: action, name: name.replace(/…$/, ""), group: section || "Menu", place: "any" });
    const k = fromAccelerator(keys);
    DEFAULT_KEYS[action] = k ? [k] : [];
  }
}

// The action a key runs here. Atom and bond keys win over keys that work anywhere.
export function actionFor(map: Keymap, key: string, place: "atom" | "bond" | "none"): string | undefined {
  const found = (p: Place) => ACTIONS.find((a) => (a.place === p || (a.place === "item" && p !== "any")) && map[a.id]?.includes(key))?.id;
  return (place !== "none" ? found(place) : undefined) ?? found("any");
}

// Other actions that already use this key in the same place.
export function clashes(map: Keymap, id: string, key: string): string[] {
  const place = ACTIONS.find((a) => a.id === id)?.place;
  const near = (p?: Place) => p === place || (p === "item" && (place === "atom" || place === "bond")) || (place === "item" && (p === "atom" || p === "bond"));
  return ACTIONS.filter((a) => a.id !== id && near(a.place) && map[a.id]?.includes(key)).map((a) => a.id);
}
