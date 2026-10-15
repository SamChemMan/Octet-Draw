// User settings, kept on this computer. Every default here is the one a new user gets.
// snap: snap moved structures to others. eraser: eraser radius in bond lengths. keys: the user's shortcut changes.
export type Settings = { snap: boolean; eraser: number; keys: Record<string, string[]> };
const DEFAULTS: Settings = { snap: true, eraser: 0.15, keys: {} };
const KEY = "octet.settings";

export function loadSettings(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
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
