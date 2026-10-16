// User settings, kept on this computer. Every default here is the one a new user gets.
// snap: snap moved structures to others. eraser: eraser radius in bond lengths. keys: the user's shortcut changes.
// variants: the bond and ring each tool had last.
// strips: the width each tool's options strip was dragged to. actions: whether the Actions panel is open.
export type Settings = {
  snap: boolean; eraser: number; keys: Record<string, string[]>; variants: { select: string; bond: string; ring: string };
  strips: Record<string, number>; actions: boolean;
};
const DEFAULTS: Settings = { snap: true, eraser: 0.15, keys: {}, variants: { select: "box", bond: "single", ring: "benzene" }, strips: {}, actions: true };
const KEY = "octet.settings";

export function loadSettings(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return { ...DEFAULTS, ...saved, variants: { ...DEFAULTS.variants, ...saved.variants } };
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
