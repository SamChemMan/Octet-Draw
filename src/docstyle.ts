// The document's style: its page, its drawing style and its text defaults. Saved in the file, so a drawing looks
// the same wherever it is opened. Journal presets use each publisher's house numbers (lengths in points).
import type { Style } from "./render.ts";

// Pages in mm, portrait. Half: a half-width manuscript column. ACS columns: 3.25 in and 7 in wide, 9.5 in tall.
// Slides: PowerPoint's Widescreen (13.333 x 7.5 in, its default) and On-screen Show (10 x 7.5 in), stored portrait like
// the rest, so a slide is a slide page with landscape on.
export type PageName = "A4" | "A3" | "A2" | "A1" | "A0" | "Letter" | "Legal" | "Tabloid" | "Half" | "ACS1" | "ACS2" | "Slide169" | "Slide43" | "Custom";
export const PAGES: Record<Exclude<PageName, "Custom">, [number, number]> = {
  A4: [210, 297], A3: [297, 420], A2: [420, 594], A1: [594, 841], A0: [841, 1189], Letter: [215.9, 279.4], Legal: [215.9, 355.6], Tabloid: [279.4, 431.8],
  Half: [105, 297], ACS1: [82.55, 241.3], ACS2: [177.8, 241.3], Slide169: [190.5, 338.67], Slide43: [190.5, 254],
};
export const PAGE_NAMES: Record<PageName, string> = {
  A4: "A4", A3: "A3", A2: "A2", A1: "A1", A0: "A0", Letter: "US Letter", Legal: "US Legal", Tabloid: "Tabloid",
  Half: "Half page", ACS1: "ACS 1-column", ACS2: "ACS 2-column", Slide169: "Slide 16:9", Slide43: "Slide 4:3", Custom: "Custom",
};
// The page's width and height in mm, turned for landscape.
export function pageSize(s: Pick<DocStyle, "page" | "custom" | "landscape">): [number, number] {
  const [w, h] = s.page === "Custom" ? s.custom : PAGES[s.page];
  return s.landscape ? [h, w] : [w, h];
}
// A page picked from the page list. A slide is landscape and a sheet of paper portrait: a pick of a slide from a paper
// page, or of a paper page from a slide, turns the page to its usual way round. Other picks keep the orientation.
export function pickPage(s: Pick<DocStyle, "page" | "landscape">, page: PageName): { page: PageName; landscape: boolean } {
  const slide = (n: PageName) => n.startsWith("Slide");
  return { page, landscape: slide(page) !== slide(s.page) ? slide(page) : s.landscape };
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
  // The style's size against its preset (1 is 100%): bond, line, bold, margin, hash and the two text sizes hold the
  // preset's values times it (decision 0007). Bond spacing is a percent, so it does not change.
  scale: number;
  // What the drawing is for: "paper", "thesis", "slides", "poster" or one of the user's own (PURPOSES). It sets the
  // outlines on the canvas. A file from another program has none.
  purpose?: string;
};

type Drawn = Pick<DocStyle, "bond" | "line" | "bold" | "margin" | "hash" | "spacing" | "labelFont" | "labelSize" | "captionFont" | "captionSize">;
// ChemDraw 26.1's pads, with Times New Roman mapped to Arial (Octet uses no serif fonts; the user can pick one).
export const PRESETS: Record<string, Drawn> = {
  "ACS Document 1996": { bond: 14.4, line: 0.6, bold: 2, margin: 1.6, hash: 2.5, spacing: 18, labelFont: "Arial", labelSize: 10, captionFont: "Arial", captionSize: 10 },
  "RSC": { bond: 12.2, line: 0.45, bold: 1.6, margin: 1.25, hash: 1.75, spacing: 20, labelFont: "Arial", labelSize: 7, captionFont: "Arial", captionSize: 7 },
  "Wiley (Angewandte)": { bond: 17, line: 0.75, bold: 2.6, margin: 2, hash: 2.6, spacing: 18, labelFont: "Arial", labelSize: 12, captionFont: "Arial", captionSize: 12 },
  "Nature": { bond: 10.8, line: 0.6, bold: 1.56, margin: 1.19, hash: 1.7, spacing: 18, labelFont: "Arial", labelSize: 6, captionFont: "Arial", captionSize: 6 },
  "Adv. Synth. Catal.": { bond: 17, line: 1, bold: 2, margin: 1.6, hash: 2.5, spacing: 18, labelFont: "Arial", labelSize: 10, captionFont: "Arial", captionSize: 12 },
  "Thieme (Synthesis, Synlett)": { bond: 17, line: 0.8, bold: 2, margin: 1.3, hash: 2.5, spacing: 18, labelFont: "Arial", labelSize: 10, captionFont: "Arial", captionSize: 10 },
  "Science of Synthesis": { bond: 17, line: 0.8, bold: 2, margin: 2.25, hash: 2.5, spacing: 18, labelFont: "Arial", labelSize: 10, captionFont: "Arial", captionSize: 10 },
  "Helv. Chim. Acta": { bond: 17, line: 0.6, bold: 2, margin: 2, hash: 2, spacing: 15, labelFont: "Arial", labelSize: 10, captionFont: "Arial", captionSize: 12 },
  "J. Chin. Chem. Soc.": { bond: 18, line: 1, bold: 2.5, margin: 2, hash: 2.5, spacing: 20, labelFont: "Arial", labelSize: 12, captionFont: "Arial", captionSize: 12 },
  "J. Het. Chem.": { bond: 10.8, line: 0.6, bold: 2.07, margin: 1.08, hash: 1.3, spacing: 16, labelFont: "Arial", labelSize: 7, captionFont: "Arial", captionSize: 7 },
  "Phytomedicine": { bond: 20, line: 1, bold: 1.33, margin: 1.25, hash: 3, spacing: 8, labelFont: "Arial", labelSize: 12, captionFont: "Arial", captionSize: 12 },
  "New Document (ChemDraw)": { bond: 30, line: 1, bold: 4, margin: 2, hash: 2.7, spacing: 12, labelFont: "Arial", labelSize: 10, captionFont: "Arial", captionSize: 12 },
  "New Slide (ChemDraw)": { bond: 30, line: 1.6, bold: 4, margin: 2, hash: 2.7, spacing: 15, labelFont: "Arial", labelSize: 12, captionFont: "Arial", captionSize: 16 },
};
export const DEFAULT_STYLE: DocStyle = { preset: "ACS Document 1996", page: "A4", custom: [180, 120], landscape: false, edges: true, grid: 0, background: "white", colour: "#000000", terminalLabels: false, carbonLabels: false, hideH: false, scale: 1, ...PRESETS["ACS Document 1996"] };
// The lengths and sizes a document scale multiplies (bond spacing is a percent, so it stays).
export const SCALED = ["bond", "line", "bold", "margin", "hash", "labelSize", "captionSize"] as const;
// The values readStyle keeps for each of them (pt); anything else falls back to the default. Lengths reach 10 times
// the old limits each way, so a scale of 10% to 1000% keeps every preset in proportion.
const LIMITS: Record<(typeof SCALED)[number], [number, number]> = {
  bond: [0.4, 720], line: [0.01, 60], bold: [0.02, 120], margin: [0, 100], hash: [0.05, 100], labelSize: [0.1, 999], captionSize: [0.1, 999],
};
const round = (n: number) => Math.round(n * 1e4) / 1e4;
// A preset's values at a scale.
export const presetAt = (name: string, scale: number): Drawn => {
  const p = { ...PRESETS[name] };
  for (const k of SCALED) p[k] = round(p[k] * scale);
  return p;
};
// A text size as Octet offers it: to the nearest half point from 5 pt, and to the nearest tenth below (so a small
// document's sizes stay apart). 0.1 pt at least.
export const roundPt = (pt: number) => (pt >= 5 ? Math.round(pt * 2) / 2 : Math.max(0.1, Math.round(pt * 10) / 10));
// A text size on offer (SIZES) at the document scale. A typed size can be anything from 0.1 to 999 pt.
export const sizeAt = (pt: number, scale: number) => roundPt(pt * scale);
// The style at another document scale (10% to 1000%): its scaled values multiplied by the change, the rest kept. A
// preset's values are worked out again from the preset, so a change of scale and back leaves no rounding behind. A
// scale that would take a value past its limits stops where that value reaches them, so no value falls back to the
// default (a custom 100 pt bond goes to 720%, not 1000%).
export function withScale(s: DocStyle, want: number): DocStyle {
  let scale = Math.min(10, Math.max(0.1, want));
  for (const k of SCALED) {
    const v = s[k] / s.scale;
    if (v > 0) scale = Math.min(Math.max(scale, LIMITS[k][0] / v), LIMITS[k][1] / v);
  }
  scale = Math.round(scale * 1e9) / 1e9;
  const name = presetOf(s), next = { ...s, scale, ...(name in PRESETS ? presetAt(name, scale) : {}) };
  if (!(name in PRESETS)) for (const k of SCALED) next[k] = round(s[k] * (scale / s.scale));
  return { ...next, preset: presetOf(next) };
}

export const FONTS = ["Arial", "Helvetica", "Times New Roman", "Calibri", "Cambria", "Georgia"];
// Text sizes (pt) on offer in the Actions panel and the Text menu: ChemDraw's Size menu (5 to 24) and 36, times the
// document scale (sizeAt). Any other size can be typed.
export const SIZES = [5, 6, 7, 8, 9, 10, 12, 14, 16, 18, 24, 36];
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

// Highlight colours (a disc behind each atom, a ring fill, a spectrum peak): distinct, and clear on white at 40%
// behind a structure. One list, named, for the Actions panel and the Spectrum.
export const HIGHLIGHTS: [string, string][] = [
  ["Blue", "#2F6FED"], ["Orange", "#F28C28"], ["Green", "#2BA84A"], ["Red", "#E5484D"], ["Purple", "#8E4EC6"],
  ["Teal", "#12A594"], ["Pink", "#D6409F"], ["Gold", "#C9A000"], ["Brown", "#A0522D"], ["Slate", "#5B6B8C"],
];

// Colour by element (ChemDraw's Colors > By Element): each heteroatom label takes its atom-* token, as the light
// theme gives it, since the page is white. Carbon and the rest stay ink.
const METALS = "Li Na K Rb Cs Be Mg Ca Sr Ba Al Ga In Tl Sn Pb Bi Sc Ti V Cr Mn Fe Co Ni Cu Zn Y Zr Nb Mo Ru Rh Pd Ag Cd Hf Ta W Re Os Ir Pt Au Hg La Ce Sm Eu Gd Yb Lu U".split(" ");
export function elementColours(token?: (name: string) => string): Record<string, string> {
  if (!token) {
    const probe = document.createElement("div");
    probe.dataset.theme = "light";
    document.body.append(probe);
    const css = getComputedStyle(probe), values = elementColours((name) => css.getPropertyValue(`--atom-${name}`).trim());
    probe.remove();
    return values;
  }
  const by: Record<string, string> = { N: token("n"), O: token("o"), S: token("s"), Se: token("s"), P: token("p") };
  for (const e of ["F", "Cl", "Br", "I"]) by[e] = token("halogen");
  for (const e of METALS) by[e] = token("metal");
  return by;
}

// The preset a style matches at its scale, if any.
export function presetOf(s: DocStyle): string {
  const same = (a: unknown, b: unknown) => (typeof a === "number" && typeof b === "number" ? Math.abs(a - b) <= 1e-4 + 1e-6 * Math.abs(b) : a === b);
  return Object.keys(PRESETS).find((name) => { const p = presetAt(name, s.scale ?? 1); return (Object.keys(p) as (keyof Drawn)[]).every((k) => same(p[k], s[k])); }) ?? "Custom";
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
    bond: num("bond", ...LIMITS.bond), line: num("line", ...LIMITS.line), bold: num("bold", ...LIMITS.bold), margin: num("margin", ...LIMITS.margin), hash: num("hash", ...LIMITS.hash), spacing: num("spacing", 5, 40),
    labelFont: text("labelFont", fontName), labelSize: num("labelSize", ...LIMITS.labelSize),
    captionFont: text("captionFont", fontName), captionSize: num("captionSize", ...LIMITS.captionSize),
    colour: text("colour", (t) => /^#[0-9a-f]{6}$/i.test(t)),
    terminalLabels: s.terminalLabels === true, carbonLabels: s.carbonLabels === true, hideH: s.hideH === true,
    scale: num("scale", 0.1, 10),
    ...(typeof s.purpose === "string" && /^[a-z0-9-]{1,40}$/.test(s.purpose) ? { purpose: s.purpose } : {}),
  };
  return { ...style, preset: presetOf(style) };
}

// What a drawing is for (IDEA-SIZE-1 to 3): a journal style at a scale, on a page. Paper and Thesis keep the journal's
// own sizes. Slides is ACS at 200% on PowerPoint's 16:9 slide (a 28.8 pt bond, near ChemDraw's 30 pt New Slide, with
// ACS's proportions). Poster is ACS at 300% on A0: 30 pt text, which UC Davis gives as legible from 6 feet.
export type PurposeKind = "paper" | "thesis" | "slides" | "poster";
export const PURPOSES: Record<PurposeKind, { name: string; scale: number; page: PageName; landscape: boolean }> = {
  paper: { name: "Paper", scale: 1, page: "A4", landscape: false },
  thesis: { name: "Thesis", scale: 1, page: "A4", landscape: false },
  slides: { name: "Slides", scale: 2, page: "Slide169", landscape: true },
  poster: { name: "Poster", scale: 3, page: "A0", landscape: false },
};
export const isKind = (id: unknown): id is PurposeKind => typeof id === "string" && id in PURPOSES;
// A purpose's style as Octet gives it: ACS Document 1996 at the purpose's scale, on its page.
export const purposeStyle = (kind: PurposeKind): DocStyle =>
  readStyle({ ...DEFAULT_STYLE, ...presetAt(DEFAULT_STYLE.preset, PURPOSES[kind].scale), scale: PURPOSES[kind].scale, page: PURPOSES[kind].page, landscape: PURPOSES[kind].landscape, purpose: kind });
// A user's own purpose (Save as a new purpose…): its name, its style, and the purpose it was made from, which sets its outlines.
export type OwnPurpose = { id: string; name: string; kind: PurposeKind; style: DocStyle };
// An open drawing given another purpose: its drawn values, scale and page. Its background, page edges, gridlines,
// text colour and carbon label choices stay.
export function forPurpose(s: DocStyle, p: DocStyle): DocStyle {
  const { bond, line, bold, margin, hash, spacing, labelFont, labelSize, captionFont, captionSize, scale, page, custom, landscape, purpose } = p;
  return readStyle({ ...s, bond, line, bold, margin, hash, spacing, labelFont, labelSize, captionFont, captionSize, scale, page, custom, landscape, purpose });
}

// The purposes from saved settings (settings.ts). A default style saved before purposes (docStyle) becomes Paper's.
export type Purposes = { purpose: string; purposeStyles: Partial<Record<PurposeKind, DocStyle>>; ownPurposes: OwnPurpose[] };
export function readPurposes(saved: Record<string, unknown>): Purposes {
  const styles = (typeof saved.purposeStyles === "object" && saved.purposeStyles ? saved.purposeStyles : {}) as Record<string, unknown>, purposeStyles: Purposes["purposeStyles"] = {};
  for (const kind of Object.keys(PURPOSES) as PurposeKind[]) if (styles[kind]) purposeStyles[kind] = { ...readStyle(styles[kind]), purpose: kind };
  if (!saved.purposeStyles && saved.docStyle) {
    const old = readStyle(saved.docStyle);
    if (!sameStyle(old, DEFAULT_STYLE)) purposeStyles.paper = { ...old, purpose: "paper" };
  }
  const ownPurposes = (Array.isArray(saved.ownPurposes) ? saved.ownPurposes : []).flatMap((p: unknown): OwnPurpose[] => {
    const o = (typeof p === "object" && p ? p : {}) as Record<string, unknown>;
    return typeof o.id === "string" && /^u[a-z0-9]{1,30}$/.test(o.id) && typeof o.name === "string" && o.name.trim() && isKind(o.kind)
      ? [{ id: o.id, name: o.name.trim().slice(0, 40), kind: o.kind, style: { ...readStyle(o.style), purpose: o.id } }] : [];
  }).slice(0, MAX_PURPOSES);
  const purpose = typeof saved.purpose === "string" && (isKind(saved.purpose) || ownPurposes.some((p) => p.id === saved.purpose)) ? saved.purpose : "paper";
  return { purpose, purposeStyles, ownPurposes };
}
export const MAX_PURPOSES = 12;
// Two styles the same in every value, whatever their purpose and preset name.
export const sameStyle = (a: DocStyle, b: DocStyle) => (Object.keys({ ...a, ...b }) as (keyof DocStyle)[]).every((k) => k === "preset" || k === "purpose" || JSON.stringify(a[k]) === JSON.stringify(b[k]));
// The style a new drawing for a purpose starts with: the user's own purpose, the user's style for a built-in one, or
// Octet's. An unknown purpose is Paper.
export function styleFor(s: Pick<Purposes, "purposeStyles" | "ownPurposes">, id: string): DocStyle {
  const own = s.ownPurposes.find((p) => p.id === id), kind = isKind(id) ? id : "paper";
  return own ? own.style : s.purposeStyles[kind] ?? purposeStyle(kind);
}
// A purpose's name and kind (the kind sets its outlines), for an id; undefined when there is no such purpose.
export function purposeOf(s: Pick<Purposes, "ownPurposes">, id?: string): { name: string; kind: PurposeKind } | undefined {
  return isKind(id) ? { name: PURPOSES[id].name, kind: id } : s.ownPurposes.find((p) => p.id === id);
}

// Journal columns, as outlines for Paper (mm, portrait): ACS 3.25 and 7 in by 9.5 in; Nature 89 and 183 mm wide, 240 mm
// tall as ChemDraw 26.1's Nature pad; RSC 83 x 228 mm, ChemDraw 26.1's RSC (1 Column) pad.
const COLUMNS: Record<string, [string, number, number][]> = {
  "ACS Document 1996": [[PAGE_NAMES.ACS1, ...PAGES.ACS1], [PAGE_NAMES.ACS2, ...PAGES.ACS2]],
  "Nature": [["Nature 1-column", 89, 240], ["Nature 2-column", 183, 240]],
  "RSC": [["RSC 1-column", 83, 228]],
};
// The outlines a drawing shows on the canvas (IDEA-SIZE-6), in mm, each with its name: its page first, then what its
// purpose needs. Paper: the journal's columns. Thesis: the text block of an A4 thesis (150 x 257 mm: a 40 mm binding
// margin, 20 mm on the other sides). Slides: the slide alone. Poster: A0 with A1 inside. With no purpose: the page's
// ISO or US series (A4, A3, A2 or Letter, Legal, Tabloid).
export function outlines(s: DocStyle, kind?: PurposeKind): [string, number, number][] {
  const named = (page: PageName, size = pageSize({ ...s, page })): [string, number, number] =>
    [page === "Custom" ? `${Math.round(size[0])} × ${Math.round(size[1])} mm` : PAGE_NAMES[page].replace("US ", ""), size[0], size[1]];
  const turned = (name: string, w: number, h: number): [string, number, number] => (s.landscape ? [name, h, w] : [name, w, h]);
  const page = named(s.page, pageSize(s));
  if (kind === "paper") return [page, ...(COLUMNS[presetOf(s)] ?? [])];
  if (kind === "thesis") return [page, turned("Text block", 150, 257)];
  if (kind === "slides") return [page];
  if (kind === "poster") return s.page === "A0" ? [page, named("A1")] : [page];
  const series = (["A4", "A3", "A2"] as PageName[]).includes(s.page) ? ["A4", "A3", "A2"] : (["Letter", "Legal", "Tabloid"] as PageName[]).includes(s.page) ? ["Letter", "Legal", "Tabloid"] : [];
  return [page, ...(series as PageName[]).filter((n) => n !== s.page).map((n) => named(n))];
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
