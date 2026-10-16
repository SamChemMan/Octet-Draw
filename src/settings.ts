// User settings, kept on this computer. Every default here is the one a new user gets.
// snap: snap moved structures to others. eraser: eraser radius in bond lengths. keys: the user's shortcut changes.
// variants: the bond and ring each tool had last.
// strips: the width each tool's options strip was dragged to. actions: whether the Actions panel is open.
// templates: the user's own rings. pinned: options dragged onto the toolbar, as "tool:variant".
// actionLayout: for each kind of selection, the user's order of Actions panel actions and how many show as rows.
// curvedArrows: the curved arrows kept in the Arrow strip, as "kind-sweep".
import type { SavedTemplate } from "./templates";
import { DEFAULT_STYLE, readStyle, type DocStyle } from "./docstyle";
import { DEFAULT_FILES, type FilePrefs } from "./SettingsWindow";

export type Settings = {
  snap: boolean; eraser: number; keys: Record<string, string[]>; variants: { select: string; bond: string; ring: string; template: string; symbol: string; orbital: string; arrow: string; shape: string; bracket: string; more: string };
  strips: Record<string, number>; actions: boolean; templates: SavedTemplate[]; pinned: string[];
  actionLayout: Record<string, { order: string[]; rows: number }>;
  docStyle: DocStyle; // the style new documents start with
  files: FilePrefs; // export, copy and import preferences
  settingsModule: string; // the Settings module last open
  curvedArrows: string[];
  libraryRings: string[]; // library templates kept in the Ring strip, as "lib:name"
  nameHistory: { name: string; smiles: string }[]; // names drawn with Name to structure, newest first (50 at most), each with its structure
  paletteWide: boolean; // the toolbar in two columns
  palette: Swatch[]; // the user's own colours, named, after Octet's in every colour row and the Colour menu (20 at most)
  properties: boolean; // the Chemical Properties panel is open
  propertyRows: string[]; // the rows Add to drawing writes under a structure
  nmrMhz: number; nmrSolvent: string; nmrSolventPeaks: boolean; nmrDetails: boolean; // the predicted spectrum's frequency (¹H, MHz), solvent, and whether its peaks show
};
export type Swatch = { name: string; hex: string };
const DEFAULTS: Settings = { snap: true, eraser: 0.15, keys: {}, variants: { select: "box", bond: "single", ring: "benzene", template: "lib:Alanine", symbol: "plus", orbital: "p-shaded", arrow: "reaction", shape: "box-plain", bracket: "brackets", more: "tlc" }, strips: {}, actions: true, templates: [], pinned: [], actionLayout: {}, docStyle: DEFAULT_STYLE, files: DEFAULT_FILES, settingsModule: "document", curvedArrows: ["curved-120", "fishhook-120"], libraryRings: [], nameHistory: [], paletteWide: false, palette: [], properties: false, propertyRows: ["formula", "weight"], nmrMhz: 400, nmrSolvent: "CDCl₃", nmrSolventPeaks: true, nmrDetails: false };
const KEY = "octet.settings";

export function loadSettings(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    const list = <T,>(v: unknown, ok: (x: unknown) => boolean) => (Array.isArray(v) ? (v.filter(ok) as T[]) : []);
    return {
      ...DEFAULTS, ...saved, variants: { ...DEFAULTS.variants, ...saved.variants },
      templates: list<SavedTemplate>(saved.templates, (t) => typeof t === "object" && t !== null),
      pinned: list<string>(saved.pinned, (k) => typeof k === "string"),
      libraryRings: list<string>(saved.libraryRings, (k) => typeof k === "string"),
      nameHistory: (Array.isArray(saved.nameHistory) ? saved.nameHistory : []).flatMap((k: unknown) =>
        typeof k === "string" ? [{ name: k, smiles: "" }] : typeof k === "object" && k && typeof (k as { name?: unknown }).name === "string" && typeof (k as { smiles?: unknown }).smiles === "string" ? [k as { name: string; smiles: string }] : [],
      ).filter((k: { name: string; smiles: string }) => k.name.length <= 300 && k.smiles.length <= 2000).slice(0, 50),
      curvedArrows: Array.isArray(saved.curvedArrows) ? list<string>(saved.curvedArrows, (k) => typeof k === "string") : DEFAULTS.curvedArrows,
      docStyle: readStyle(saved.docStyle),
      files: { ...DEFAULT_FILES, ...(typeof saved.files === "object" && saved.files ? saved.files : {}), clipboard: { ...DEFAULT_FILES.clipboard, ...(saved.files?.clipboard ?? {}) } },
      paletteWide: saved.paletteWide === true,
      properties: saved.properties === true,
      nmrMhz: typeof saved.nmrMhz === "number" && saved.nmrMhz >= 20 && saved.nmrMhz <= 1500 ? saved.nmrMhz : DEFAULTS.nmrMhz,
      nmrSolvent: typeof saved.nmrSolvent === "string" && saved.nmrSolvent.length < 20 ? saved.nmrSolvent : DEFAULTS.nmrSolvent,
      nmrSolventPeaks: saved.nmrSolventPeaks !== false,
      nmrDetails: saved.nmrDetails === true,
      propertyRows: Array.isArray(saved.propertyRows) ? list<string>(saved.propertyRows, (k) => typeof k === "string" && k.length < 20).slice(0, 30) : DEFAULTS.propertyRows,
      palette: list<Swatch>(saved.palette, (c) => typeof c === "object" && c !== null && typeof (c as Swatch).name === "string" && /^#[0-9a-f]{6}$/i.test((c as Swatch).hex)).slice(0, 20),
      actionLayout: typeof saved.actionLayout === "object" && saved.actionLayout !== null && !Array.isArray(saved.actionLayout) ? saved.actionLayout : {},
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
