// Keyboard shortcuts. Each action works in one place: over an atom, over a bond, or anywhere else.
// The same key can do different things in different places (N over an atom, 2 over a bond), as in ChemDraw.
// The defaults follow ChemDraw's hotkeys; the user's changes sit on top and are kept in settings.

export type Place = "atom" | "bond" | "any";
export type Group = "Atoms" | "Bonds" | "Tools" | "Edit";
export type Action = { id: string; name: string; group: Group; place: Place };

const element = (symbol: string, name: string): Action => ({ id: `element.${symbol}`, name: `Set atom to ${name}`, group: "Atoms", place: "atom" });

export const ACTIONS: Action[] = [
  element("C", "carbon"), element("N", "nitrogen"), element("O", "oxygen"), element("S", "sulfur"), element("P", "phosphorus"),
  element("F", "fluorine"), element("Cl", "chlorine"), element("Br", "bromine"), element("I", "iodine"), element("H", "hydrogen"),
  element("B", "boron"), element("Si", "silicon"),
  { id: "charge.plus", name: "Add a positive charge", group: "Atoms", place: "atom" },
  { id: "charge.minus", name: "Add a negative charge", group: "Atoms", place: "atom" },
  { id: "bond.single", name: "Make bond single", group: "Bonds", place: "bond" },
  { id: "bond.double", name: "Make bond double", group: "Bonds", place: "bond" },
  { id: "bond.triple", name: "Make bond triple", group: "Bonds", place: "bond" },
  { id: "bond.wedge", name: "Make bond a wedge", group: "Bonds", place: "bond" },
  { id: "bond.hash", name: "Make bond a hashed wedge", group: "Bonds", place: "bond" },
  { id: "tool.select", name: "Select tool", group: "Tools", place: "any" },
  { id: "tool.bond", name: "Bond tool", group: "Tools", place: "any" },
  { id: "tool.benzene", name: "Benzene tool", group: "Tools", place: "any" },
  { id: "tool.cyclohexane", name: "Cyclohexane tool", group: "Tools", place: "any" },
  { id: "tool.cyclopentane", name: "Cyclopentane tool", group: "Tools", place: "any" },
  { id: "tool.erase", name: "Eraser tool", group: "Tools", place: "any" },
  { id: "eraser.smaller", name: "Make the eraser smaller", group: "Tools", place: "any" },
  { id: "eraser.bigger", name: "Make the eraser bigger", group: "Tools", place: "any" },
  { id: "edit.delete", name: "Delete the selection, or what is under the pointer", group: "Edit", place: "any" },
];

// Default keys. Provisional until checked against ChemDraw's hotkey list.
export const DEFAULT_KEYS: Record<string, string[]> = {
  "element.C": ["c"], "element.N": ["n"], "element.O": ["o"], "element.S": ["s"], "element.P": ["p"],
  "element.F": ["f"], "element.Cl": ["l"], "element.Br": ["r"], "element.I": ["i"], "element.H": ["h"],
  "element.B": ["b"], "element.Si": ["shift+s"],
  "charge.plus": ["+", "="], "charge.minus": ["-"],
  "bond.single": ["1"], "bond.double": ["2"], "bond.triple": ["3"], "bond.wedge": ["w"], "bond.hash": ["h"],
  "tool.select": [], "tool.bond": [], "tool.benzene": [], "tool.cyclohexane": [], "tool.cyclopentane": [], "tool.erase": [],
  "eraser.smaller": ["["], "eraser.bigger": ["]"],
  "edit.delete": ["delete", "backspace"],
};

export type Keymap = Record<string, string[]>;
export const keymap = (changes: Keymap = {}): Keymap => ({ ...DEFAULT_KEYS, ...changes });

// One key press as a string: "n", "shift+n", "+", "delete". Letters keep Shift; symbols are already shifted.
export function keyOf(e: { key: string; shiftKey: boolean; altKey: boolean; metaKey: boolean; ctrlKey: boolean }): string | undefined {
  if (["Shift", "Alt", "Meta", "Control", "CapsLock", "Dead"].includes(e.key)) return undefined;
  const key = e.key === " " ? "space" : e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();
  const mods = [(e.metaKey || e.ctrlKey) && "mod", e.altKey && "alt", e.shiftKey && /^[a-z]$/.test(key) && "shift"].filter(Boolean);
  return [...mods, key].join("+");
}

// How a key looks on screen.
const MAC = typeof navigator !== "undefined" && navigator.platform.startsWith("Mac");
const NAMES: Record<string, string> = { delete: "Delete", backspace: MAC ? "⌫" : "Backspace", space: "Space", escape: "Esc", "-": "−" };
export function label(key: string): string {
  return key.split("+").map((part, i, all) => {
    if (i < all.length - 1) return part === "mod" ? (MAC ? "⌘" : "Ctrl+") : part === "alt" ? (MAC ? "⌥" : "Alt+") : MAC ? "⇧" : "Shift+";
    return NAMES[part] ?? (part.length === 1 ? part.toUpperCase() : part);
  }).join("");
}

// The action a key runs here. Atom and bond keys win over keys that work anywhere.
export function actionFor(map: Keymap, key: string, place: "atom" | "bond" | "none"): string | undefined {
  const found = (p: Place) => ACTIONS.find((a) => a.place === p && map[a.id]?.includes(key))?.id;
  return (place !== "none" ? found(place) : undefined) ?? found("any");
}

// Other actions that already use this key in the same place.
export function clashes(map: Keymap, id: string, key: string): string[] {
  const place = ACTIONS.find((a) => a.id === id)?.place;
  return ACTIONS.filter((a) => a.id !== id && a.place === place && map[a.id]?.includes(key)).map((a) => a.id);
}
