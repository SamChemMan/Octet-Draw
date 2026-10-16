// User settings, kept on this computer. Every default here is the one a new user gets.
// snap: snap moved structures to others. eraser: eraser radius in bond lengths. keys: the user's shortcut changes.
// variants: the bond and ring each tool had last.
// strips: the width each tool's options strip was dragged to. actions: whether the Actions panel is open.
// templates: the user's own rings. pinned: options dragged onto the toolbar, as "tool:variant".
import type { SavedTemplate } from "./templates";

export type Settings = {
  snap: boolean; eraser: number; keys: Record<string, string[]>; variants: { select: string; bond: string; ring: string };
  strips: Record<string, number>; actions: boolean; templates: SavedTemplate[]; pinned: string[];
};
const DEFAULTS: Settings = { snap: true, eraser: 0.15, keys: {}, variants: { select: "box", bond: "single", ring: "benzene" }, strips: {}, actions: true, templates: [], pinned: [] };
const KEY = "octet.settings";

export function loadSettings(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    const list = <T,>(v: unknown, ok: (x: unknown) => boolean) => (Array.isArray(v) ? (v.filter(ok) as T[]) : []);
    return {
      ...DEFAULTS, ...saved, variants: { ...DEFAULTS.variants, ...saved.variants },
      templates: list<SavedTemplate>(saved.templates, (t) => typeof t === "object" && t !== null),
      pinned: list<string>(saved.pinned, (k) => typeof k === "string"),
    };
  } catch {
    return DEFAULTS;
  }
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Storage can be unavailable; the setting then lasts for this session only.
  }
}
