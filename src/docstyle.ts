// The document's style: its page, its drawing style and its text defaults. Saved in the file, so a drawing looks
// the same wherever it is opened. Journal presets use each publisher's house numbers (lengths in points).
import type { Style } from "./render.ts";

// Pages in mm, portrait. Half: a half-width manuscript column. ACS columns: 3.25 in and 7 in wide, 9.5 in tall.
export type PageName = "A4" | "A3" | "A2" | "Letter" | "Legal" | "Tabloid" | "Half" | "ACS1" | "ACS2" | "Custom";
export const PAGES: Record<Exclude<PageName, "Custom">, [number, number]> = {
  A4: [210, 297], A3: [297, 420], A2: [420, 594], Letter: [215.9, 279.4], Legal: [215.9, 355.6], Tabloid: [279.4, 431.8],
  Half: [105, 297], ACS1: [82.55, 241.3], ACS2: [177.8, 241.3],
};
export const PAGE_NAMES: Record<PageName, string> = {
  A4: "A4", A3: "A3", A2: "A2", Letter: "US Letter", Legal: "US Legal", Tabloid: "Tabloid",
  Half: "Half page", ACS1: "ACS 1-column", ACS2: "ACS 2-column", Custom: "Custom",
};
// The page's width and height in mm, turned for landscape.
export function pageSize(s: Pick<DocStyle, "page" | "custom" | "landscape">): [number, number] {
  const [w, h] = s.page === "Custom" ? s.custom : PAGES[s.page];
  return s.landscape ? [h, w] : [w, h];
}

// The page's background: white, dark, the system's light or dark, or engineering paper (blue, with a grid). On a
// dark or blue page the structures and text are drawn white.
export type Background = "white" | "dark" | "system" | "blueprint";
export const BACKGROUNDS: [Background, string][] = [["white", "White"], ["dark", "Dark"], ["system", "Match the system"], ["blueprint", "Engineering paper"]];
export type DocStyle = {
  preset: string; // the preset the style came from, or "Custom"
  page: PageName; custom: [number, number]; landscape: boolean; edges: boolean; grid: number; // custom: mm; grid: mm, 0 for none
  background: Background;
  bond: number; line: number; bold: number; margin: number; hash: number; spacing: number; // pt; spacing in % of bond
  labelFont: string; labelSize: number; captionFont: string; captionSize: number; colour: string;
  // Atom labels (ChemDraw's Show Labels on Terminal Carbons, on Non-Terminal Carbons, and Hide Implicit Hydrogens).
  terminalLabels: boolean; carbonLabels: boolean; hideH: boolean;
};

type Drawn = Pick<DocStyle, "bond" | "line" | "bold" | "margin" | "hash" | "spacing" | "labelFont" | "labelSize" | "captionFont" | "captionSize">;
export const PRESETS: Record<string, Drawn> = {
  "ACS Document 1996": { bond: 14.4, line: 0.6, bold: 2, margin: 1.6, hash: 2.5, spacing: 18, labelFont: "Arial", labelSize: 10, captionFont: "Arial", captionSize: 10 },
  "RSC": { bond: 12.2, line: 0.45, bold: 1.6, margin: 1.25, hash: 1.75, spacing: 20, labelFont: "Helvetica", labelSize: 7, captionFont: "Helvetica", captionSize: 7 },
  "Wiley (Angewandte)": { bond: 17, line: 0.75, bold: 2.6, margin: 2, hash: 2.6, spacing: 18, labelFont: "Arial", labelSize: 12, captionFont: "Arial", captionSize: 12 },
  "Nature": { bond: 10.8, line: 0.6, bold: 1.56, margin: 1.19, hash: 1.7, spacing: 18, labelFont: "Arial", labelSize: 6, captionFont: "Arial", captionSize: 6 },
  "Adv. Synth. Catal.": { bond: 17, line: 1, bold: 2, margin: 1.6, hash: 2.5, spacing: 18, labelFont: "Arial", labelSize: 10, captionFont: "Times New Roman", captionSize: 12 },
  "Thieme (Synthesis, Synlett)": { bond: 17, line: 0.8, bold: 2, margin: 1.3, hash: 2.5, spacing: 18, labelFont: "Arial", labelSize: 10, captionFont: "Arial", captionSize: 10 },
  "Helv. Chim. Acta": { bond: 17, line: 0.6, bold: 2, margin: 2, hash: 2, spacing: 15, labelFont: "Helvetica", labelSize: 10, captionFont: "Helvetica", captionSize: 12 },
  "Slides": { bond: 30, line: 1.6, bold: 4, margin: 2, hash: 2.7, spacing: 15, labelFont: "Arial", labelSize: 12, captionFont: "Arial", captionSize: 16 },
};
export const DEFAULT_STYLE: DocStyle = { preset: "ACS Document 1996", page: "A4", custom: [180, 120], landscape: false, edges: true, grid: 0, background: "white", colour: "#000000", terminalLabels: false, carbonLabels: false, hideH: false, ...PRESETS["ACS Document 1996"] };

export const FONTS = ["Arial", "Helvetica", "Times New Roman", "Calibri", "Cambria", "Georgia"];
// Any font on the computer can be used too, by its family name. A name with quotes, slashes or CSS punctuation is
// refused, so a name from a file cannot break out of a style.
export const fontName = (f: unknown): f is string => typeof f === "string" && f.trim() === f && /^[^"'\\;{}<>\u0000-\u001f]{1,64}$/.test(f);
// A font with fallbacks that keep its metrics close on every platform.
export const fontStack = (f: string) =>
  f === "Helvetica" ? "Helvetica, Arial, sans-serif" : f === "Arial" ? "Arial, Helvetica, sans-serif" : /Times|Georgia|Cambria/.test(f) ? `"${f}", "Times New Roman", serif` : `"${f}", Arial, sans-serif`;

// Text colours: black for print, then the brand's colours. Any other colour can be picked too.
export const COLOURS: [string, string][] = [
  ["Black", "#000000"], ["Ink", "#0F172A"], ["Octet Blue", "#213C99"], ["Bright blue", "#3F6BFF"],
  ["Green", "#22775B"], ["Amber", "#8B4E18"], ["Red", "#B42323"],
];

// Highlight fills: light tints of the brand's colours, pale enough to print behind black ink.
export const TINTS: [string, string][] = [
  ["Light blue", "#DCE4F6"], ["Light green", "#DCEFE6"], ["Light amber", "#F6E6D3"], ["Light red", "#F6DCDC"], ["Light grey", "#E9ECF0"],
];

// The preset a style matches, if any.
export function presetOf(s: DocStyle): string {
  return Object.entries(PRESETS).find(([, p]) => (Object.keys(p) as (keyof Drawn)[]).every((k) => p[k] === s[k]))?.[0] ?? "Custom";
}

// Read a style from a file or settings, keeping only valid values (anything else falls back to the default).
export function readStyle(v: unknown): DocStyle {
  const s = (typeof v === "object" && v !== null ? v : {}) as Record<string, unknown>;
  const num = (k: keyof DocStyle, lo: number, hi: number) => (typeof s[k] === "number" && (s[k] as number) >= lo && (s[k] as number) <= hi ? s[k] as number : DEFAULT_STYLE[k] as number);
  const text = (k: keyof DocStyle, ok: (t: string) => boolean) => (typeof s[k] === "string" && ok(s[k] as string) ? s[k] as string : DEFAULT_STYLE[k] as string);
  const style: DocStyle = {
    preset: "Custom",
    page: text("page", (t) => t in PAGES || t === "Custom") as PageName,
    custom: Array.isArray(s.custom) && s.custom.length === 2 && s.custom.every((n) => typeof n === "number" && n >= 10 && n <= 2000) ? [s.custom[0], s.custom[1]] : DEFAULT_STYLE.custom,
    landscape: s.landscape === true, edges: s.edges !== false, grid: num("grid", 0, 50),
    background: BACKGROUNDS.some(([b]) => b === s.background) ? (s.background as Background) : "white",
    bond: num("bond", 4, 72), line: num("line", 0.1, 6), bold: num("bold", 0.2, 12), margin: num("margin", 0, 10), hash: num("hash", 0.5, 10), spacing: num("spacing", 5, 40),
    labelFont: text("labelFont", fontName), labelSize: num("labelSize", 4, 72),
    captionFont: text("captionFont", fontName), captionSize: num("captionSize", 4, 72),
    colour: text("colour", (t) => /^#[0-9a-f]{6}$/i.test(t)),
    terminalLabels: s.terminalLabels === true, carbonLabels: s.carbonLabels === true, hideH: s.hideH === true,
  };
  return { ...style, preset: presetOf(style) };
}

// The drawing frame keeps every structure at `frame` px per bond length. A style with other lengths changes the
// widths and sizes relative to that, and the view's zoom shows it at its true size.
export function frameStyle(d: DocStyle, frame: number): Style & { k: number } {
  const k = frame / ((d.bond * 4) / 3); // frame px per true px
  const px = (pt: number) => ((pt * 4) / 3) * k;
  // ChemDraw's bonds clear label outlines by 1.69 pt for a 1.6 pt margin (measured); the same ratio for every margin.
  return { bond: frame, line: px(d.line), bold: px(d.bold), spacing: (d.spacing / 100) * frame, hash: px(d.hash), margin: px((d.margin * 1.69) / 1.6), size: px(d.labelSize), labelPt: d.labelSize, k,
    terminal: d.terminalLabels, carbons: d.carbonLabels, hideH: d.hideH };
}
