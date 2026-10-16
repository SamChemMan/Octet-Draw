// Keyboard shortcuts. Each action works in one place: over an atom, over a bond, or anywhere else.
// The same key can do different things in different places (n over an atom, 2 over a bond), as in ChemDraw.
// The defaults are ChemDraw's hotkeys, as ChemDraw 22.2 sets them (its hotkey table and its Atom and Generic Hotkeys
// help), so a ChemDraw user's hands already know them. The user's changes sit on top.

// item: over an atom or a bond.
export type Place = "atom" | "bond" | "item" | "any";
export type Group = "Atoms" | "Groups" | "Bonds" | "Tools" | "Selection" | "Edit";
export type Action = { id: string; name: string; group: Group; place: Place };

const element = (symbol: string, name: string): Action => ({ id: `element.${symbol}`, name: `Set atom to ${name}`, group: "Atoms", place: "atom" });
const group = (id: string, name: string): Action => ({ id: `group.${id}`, name, group: "Groups", place: "atom" });
const bond = (id: string, name: string): Action => ({ id: `bond.${id}`, name, group: "Bonds", place: "bond" });
const any = (id: string, name: string, g: Group): Action => ({ id, name, group: g, place: "any" });

export const ACTIONS: Action[] = [
  element("C", "carbon"), element("H", "hydrogen"), element("N", "nitrogen"), element("O", "oxygen"), element("S", "sulfur"),
  element("P", "phosphorus"), element("F", "fluorine"), element("Cl", "chlorine"), element("Br", "bromine"), element("I", "iodine"),
  element("B", "boron"), element("Si", "silicon"), element("Li", "lithium"),
  { id: "atom.label", name: "Type a label on the atom", group: "Atoms", place: "atom" },
  ...["Me", "Et", "Ph", "Ac", "OMe", "CO2Me", "CF3", "NO2", "N3", "MgBr", "Fmoc", "Cbz", "Boc", "D", "R", "X"].map((t): Action => ({ id: `label.${t}`, name: `Set atom to ${t}`, group: "Atoms", place: "atom" })),
  { id: "atom.attach", name: "Add an attachment point", group: "Atoms", place: "atom" },
  { id: "charge.plus", name: "Add a positive charge", group: "Atoms", place: "atom" },
  { id: "charge.minus", name: "Add a negative charge", group: "Atoms", place: "atom" },
  group("chain", "Add a bond (zig-zag)"), group("other", "Add a bond the other way"), group("acetyl", "Add an acetyl, or make C=O"),
  group("phenyl", "Add a phenyl"), group("wedgeMe", "Add a wedged methyl"), group("hashMe", "Add a hashed methyl"),
  group("cyclohexyl", "Add a cyclohexyl"), group("cyclopentyl", "Add a cyclopentyl"), group("cyclobutyl", "Add a cyclobutyl"),
  group("cyclopropyl", "Add a cyclopropyl"), group("methylidene", "Add =CH2"), group("dimethyl", "Add two methyls"), group("alkyne", "Add an alkyne"),
  group("sulfonyl", "Add a sulfonyl"), group("tBu", "Add a tert-butyl"),
  bond("single", "Make bond single"), bond("double", "Make bond double"), bond("triple", "Make bond triple"), bond("bolddouble", "Make bond bold double"),
  bond("wedge", "Make bond a wedge"), bond("hashwedge", "Make bond a hashed wedge"), bond("hashed", "Make bond hashed"),
  bond("bold", "Make bond bold"), bond("dashed", "Make bond dashed"), bond("wavy", "Make bond wavy"),
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
  any("nudge.left", "Move the selection left 1 pt", "Selection"), any("nudge.right", "Move the selection right 1 pt", "Selection"),
  any("nudge.up", "Move the selection up 1 pt", "Selection"), any("nudge.down", "Move the selection down 1 pt", "Selection"),
  any("nudge.left10", "Move the selection left 10 pt", "Selection"), any("nudge.right10", "Move the selection right 10 pt", "Selection"),
  any("nudge.up10", "Move the selection up 10 pt", "Selection"), any("nudge.down10", "Move the selection down 10 pt", "Selection"),
  any("rotate.ccw15", "Turn the selection 15° anticlockwise", "Selection"), any("rotate.cw15", "Turn the selection 15° clockwise", "Selection"),
  any("rotate.ccw1", "Turn the selection 1° anticlockwise", "Selection"), any("rotate.cw1", "Turn the selection 1° clockwise", "Selection"),
  any("edit.delete", "Delete the selection, or what is under the pointer", "Edit"),
];

// ChemDraw's defaults. Where its table and its help disagree (Boc: y or Shift+Y), both keys work.
export const DEFAULT_KEYS: Record<string, string[]> = {
  "element.C": ["c"], "element.H": ["h"], "element.N": ["n", "w"], "element.O": ["o", "q"], "element.S": ["s"], "element.P": ["p"],
  "element.F": ["f"], "element.Cl": ["l", "shift+c"], "element.Br": ["b"], "element.I": ["i"], "element.B": ["shift+b"],
  "element.Si": ["shift+s"], "element.Li": ["shift+l"],
  "atom.label": ["enter"],
  "label.Me": ["m"], "label.Et": ["e"], "label.Ph": ["shift+p"], "label.Ac": ["shift+a"], "label.OMe": ["shift+o"], "label.CO2Me": ["shift+e"],
  "label.CF3": ["shift+f"], "label.NO2": ["shift+n"], "label.N3": ["shift+z"], "label.MgBr": ["shift+m"], "label.Fmoc": ["shift+q"],
  "label.Cbz": ["shift+h"], "label.Boc": ["y", "shift+y"], "label.D": ["d"], "label.R": ["r"], "label.X": ["x"], "atom.attach": ["."], "select.here": ["g"],
  "charge.plus": ["+"], "charge.minus": ["-"],
  "group.chain": ["1"], "group.other": ["0"], "group.acetyl": ["2"], "group.phenyl": ["3", "a"], "group.wedgeMe": ["4"], "group.hashMe": ["5"],
  "group.cyclohexyl": ["6"], "group.cyclopentyl": ["7"], "group.methylidene": ["8"], "group.dimethyl": ["9"], "group.alkyne": ["z"],
  "group.cyclopropyl": ["v"], "group.cyclobutyl": ["u"], "group.sulfonyl": ["k"], "group.tBu": ["shift+k"],
  "bond.single": ["1"], "bond.double": ["2"], "bond.triple": ["3"], "bond.wedge": ["w"], "bond.hashwedge": ["h", "shift+w"],
  "bond.hashed": ["shift+h"], "bond.bold": ["b"], "bond.bolddouble": ["shift+b"], "bond.dashed": ["d"], "bond.wavy": ["y"],
  "bond.left": ["l"], "bond.centre": ["c"], "bond.right": ["r"],
  "bond.ring3": ["v"], "bond.ring4": ["4"], "bond.ring5": ["5"], "bond.ring6": ["6"], "bond.ring7": ["7"], "bond.ring8": ["8"],
  "bond.ring9": [], "bond.ring10": [], "bond.benzene": ["a"], "bond.cyclopentadiene": ["z"], "bond.chair1": ["9"], "bond.chair2": ["0"],
  "tool.select": ["space"], "tool.bond": ["x"], "tool.chain": ["shift+x"], "tool.ring": [], "tool.benzene": ["j"],
  "tool.cyclopentadiene": ["shift+j"], "tool.cyclohexane": [], "tool.cyclopentane": [], "tool.erase": [], "tool.text": ["t"], "tool.arrow": ["e"], "tool.template": [], "tool.symbol": ["shift+e"], "tool.shape": [],
  "tool.bracket": ["shift+t"], "tool.tlc": ["g"], "tool.orbital": ["shift+g"],
  "eraser.smaller": ["["], "eraser.bigger": ["]"],
  "nudge.left": ["arrowleft"], "nudge.right": ["arrowright"], "nudge.up": ["arrowup"], "nudge.down": ["arrowdown"],
  "nudge.left10": ["shift+arrowleft"], "nudge.right10": ["shift+arrowright"], "nudge.up10": ["shift+arrowup"], "nudge.down10": ["shift+arrowdown"],
  "rotate.ccw15": ["alt+arrowup"], "rotate.cw15": ["alt+arrowdown"], "rotate.ccw1": ["alt+arrowleft"], "rotate.cw1": ["alt+arrowright"],
  "edit.delete": ["delete", "backspace"],
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
  const mods = [(e.metaKey || e.ctrlKey) && "mod", e.altKey && "alt", e.shiftKey && (/^[a-z]$/.test(key) || named) && "shift"].filter(Boolean);
  return [...mods, key].join("+");
}

// How a key looks on screen.
const MAC = typeof navigator !== "undefined" && navigator.platform.startsWith("Mac");
const NAMES: Record<string, string> = {
  delete: "Delete", backspace: MAC ? "⌫" : "Backspace", space: "Space", escape: "Esc", enter: MAC ? "↩" : "Enter", "-": "−",
  arrowleft: "←", arrowright: "→", arrowup: "↑", arrowdown: "↓",
};
export function label(key: string): string {
  if (key === "+") return "+";
  return key.split("+").map((part, i, all) => {
    if (i < all.length - 1) return part === "mod" ? (MAC ? "⌘" : "Ctrl+") : part === "alt" ? (MAC ? "⌥" : "Alt+") : MAC ? "⇧" : "Shift+";
    return NAMES[part] ?? (part.length === 1 ? part.toUpperCase() : part);
  }).join("");
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
