// User settings, kept on this computer. Every default here is the one a new user gets.
// snap: snap moved structures to others. snapGrid: snap what is moved or placed to the grid, while it shows.
// guides: whether new drawings (and drawings from other programs) show the grid, the rulers and the crosshair: the
// last choice in the View menu, as ChemDraw keeps its own. rulerUnit: the rulers' unit.
// eraser: eraser radius in bond lengths. keys: the user's shortcut changes.
// variants: the bond and ring each tool had last.
// strips: the width each tool's options strip was dragged to. actions: whether the Actions panel is open.
// templates: the user's own rings. pinned: options dragged onto the toolbar, as "tool:variant".
// actionLayout: for each kind of selection, the user's order of Actions panel actions and how many show as rows.
// curvedArrows: the curved arrows kept in the Arrow strip, as "kind-sweep".
import type { SavedTemplate } from "./templates";
import { DEFAULT_STYLE, readStyle, type DocStyle } from "./docstyle";
import { DEFAULT_FILES, type FilePrefs } from "./SettingsWindow";

export type Settings = {
  snap: boolean; snapGrid: boolean; guides: { grid: boolean; rulers: boolean; crosshair: boolean }; rulerUnit: RulerUnit; eraser: number; keys: Record<string, string[]>; variants: { select: string; bond: string; ring: string; template: string; symbol: string; orbital: string; arrow: string; shape: string; bracket: string; more: string };
  strips: Record<string, number>; actions: boolean; templates: SavedTemplate[]; pinned: string[];
  actionLayout: Record<string, { order: string[]; rows: number }>;
  layoutVersion: number; // the Actions panel's layout scheme the saved actionLayout was made for
  panelMenus: boolean; // the Actions panel's sets of small actions as titled rows that open menus, not sections of buttons
  captionOptionReturn: boolean; // ChemDraw's "Require Option+Return to create new line in Captions": Return then closes the box
  // Home: the user's name (null until asked; "" when they skipped it), whether the tutorial was seen, and when Octet
  // was last opened (ms), for "Welcome back".
  userName: string | null; tutorialDone: boolean; lastSeen: number;
  warnings: boolean; // View > Show Chemical Warnings: problems marked on the drawing and listed in Actions
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
  onlineSearch: boolean; // Search Reaxys and Search PubChem are offered (decision 0008); off hides them everywhere
};
export type Swatch = { name: string; hex: string };
export type RulerUnit = "mm" | "cm" | "in" | "pt" | "pc";
export const RULER_UNITS: [RulerUnit, string][] = [["mm", "Millimetres"], ["cm", "Centimetres"], ["in", "Inches"], ["pt", "Points"], ["pc", "Picas"]];
const DEFAULTS: Settings = { snap: true, snapGrid: false, guides: { grid: false, rulers: false, crosshair: false }, rulerUnit: "mm", eraser: 0.15, keys: {}, variants: { select: "box", bond: "single", ring: "benzene", template: "lib:Alanine", symbol: "plus", orbital: "p-shaded", arrow: "reaction", shape: "box-plain", bracket: "brackets", more: "tlc" }, strips: {}, actions: true, templates: [], pinned: [], actionLayout: {}, layoutVersion: 3, panelMenus: false, captionOptionReturn: false, userName: null, tutorialDone: false, warnings: true, lastSeen: 0, docStyle: DEFAULT_STYLE, files: DEFAULT_FILES, settingsModule: "document", curvedArrows: ["curved-120", "fishhook-120"], libraryRings: [], nameHistory: [], paletteWide: false, palette: [], properties: false, propertyRows: ["formula", "weight"], nmrMhz: 400, nmrSolvent: "CDCl₃", nmrSolventPeaks: true, nmrDetails: false, onlineSearch: true };
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
      snapGrid: saved.snapGrid === true,
      // Settings from before Show Grid: Gridlines set (a step in mm) in the default style shows the grid.
      guides: { grid: saved.guides ? saved.guides.grid === true : typeof saved.docStyle?.grid === "number" && saved.docStyle.grid > 0, rulers: saved.guides?.rulers === true, crosshair: saved.guides?.crosshair === true },
      rulerUnit: RULER_UNITS.some(([u]) => u === saved.rulerUnit) ? saved.rulerUnit : DEFAULTS.rulerUnit,
      properties: saved.properties === true,
      nmrMhz: typeof saved.nmrMhz === "number" && saved.nmrMhz >= 20 && saved.nmrMhz <= 1500 ? saved.nmrMhz : DEFAULTS.nmrMhz,
      nmrSolvent: typeof saved.nmrSolvent === "string" && saved.nmrSolvent.length < 20 ? saved.nmrSolvent : DEFAULTS.nmrSolvent,
      nmrSolventPeaks: saved.nmrSolventPeaks !== false,
      nmrDetails: saved.nmrDetails === true,
      onlineSearch: saved.onlineSearch !== false,
      propertyRows: Array.isArray(saved.propertyRows) ? list<string>(saved.propertyRows, (k) => typeof k === "string" && k.length < 20).slice(0, 30) : DEFAULTS.propertyRows,
      palette: list<Swatch>(saved.palette, (c) => typeof c === "object" && c !== null && typeof (c as Swatch).name === "string" && /^#[0-9a-f]{6}$/i.test((c as Swatch).hex)).slice(0, 20),
      // Layouts arranged before the panel's sub-menus (17 October 2026) start again from the new defaults.
      actionLayout: saved.layoutVersion === 3 && typeof saved.actionLayout === "object" && saved.actionLayout !== null && !Array.isArray(saved.actionLayout) ? saved.actionLayout : {},
      layoutVersion: 3,
      panelMenus: saved.panelMenus === true,
      captionOptionReturn: saved.captionOptionReturn === true,
      userName: typeof saved.userName === "string" ? saved.userName.slice(0, 40) : null,
      tutorialDone: saved.tutorialDone === true,
      lastSeen: typeof saved.lastSeen === "number" && Number.isFinite(saved.lastSeen) ? saved.lastSeen : 0,
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
