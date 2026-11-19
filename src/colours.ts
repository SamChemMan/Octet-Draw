// Octet's one colour system (Sam, 19 November 2026): every colour menu lists the same parts in the same order
// (colourOptions), each colour once, as swatches. ColourPicker.tsx draws them.
import { COLOURS, HIGHLIGHT_COLOURS, RING_FILLS, TINTS } from "./docstyle.ts";
import type { Swatch } from "./settings.ts";

export const OWN_MOST = 100; // the user's own colours
export const PICK = "\u0000pick", ADD = "\u0000add"; // Pick from screen and Custom colour…
export type ColourOption = { key: string; name: string; hex?: string };
const HEX = /^#[0-9a-f]{6}$/i;
const same = (a?: string, b?: string) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

// A colour menu's options, in groups: None (where it applies), Octet's colours for the menu and the colour chosen now
// when it is in no group (named from Octet's other lists, else by its hex); then the user's own colours (o3: the third of theirs); then the drawing's
// colours (d3); then Pick from screen and Custom colour…. A colour shows once, at its first place.
export function colourOptions(presets: [string, string][], own: Swatch[], drawing: Swatch[] = [], value?: string, none = false): ColourOption[][] {
  const seen: string[] = [];
  const fresh = (hex: string) => (seen.some((h) => same(h, hex)) ? false : (seen.push(hex), true));
  const base = presets.filter(([, h]) => fresh(h)).map(([name, hex]) => ({ key: hex, name, hex }));
  const mine = own.flatMap((c, k) => (fresh(c.hex) ? [{ key: `o${k}`, name: c.name, hex: c.hex }] : []));
  const drawn = drawing.flatMap((c, k) => (fresh(c.hex) ? [{ key: `d${k}`, name: c.name, hex: c.hex }] : []));
  const odd = value && HEX.test(value) && fresh(value) ? [{ key: value, name: colourName(value, presets), hex: value }] : [];
  return [
    [...(none ? [{ key: "none", name: "None" }] : []), ...base, ...odd],
    mine,
    drawn,
    [{ key: PICK, name: "Pick from screen" }, { key: ADD, name: "Custom colour…" }],
  ];
}
// The option shown as chosen: the one with the colour chosen now (None for "none").
export const chosenKey = (groups: ColourOption[][], value?: string) =>
  groups.flat().find((o) => (o.hex ? same(o.hex, value) : o.key === "none" && value === "none"))?.key;
// The user's own colour an option is (o3), or -1.
export const ownIndex = (key: string | undefined, own: Swatch[]) => { const k = /^o(\d+)$/.exec(key ?? "") ? Number(key!.slice(1)) : -1; return k < own.length ? k : -1; };
// A colour's name: from the menu's presets, the user's colours, the drawing's or Octet's other lists, else its hex.
export const colourName = (hex: string, presets: [string, string][], own: Swatch[] = [], drawing: Swatch[] = []) =>
  hex === "none" ? "None" : presets.find(([, h]) => same(h, hex))?.[0] ?? own.find((c) => same(c.hex, hex))?.name ?? drawing.find((c) => same(c.hex, hex))?.name
    ?? [...COLOURS, ...TINTS, ...RING_FILLS].find(([, h]) => same(h, hex))?.[0] ?? hex.toUpperCase();

// Pinned colours: the swatches each colour row in the Actions panel shows, one click to apply. Each kind of row keeps
// its own (PIN_MOST at most, with None first where it applies); until the user pins one it shows Octet's first ones.
export type PinKind = "ink" | "tint" | "highlight" | "ring";
export const PIN_MOST = 6;
export const PIN_PRESETS: Record<PinKind, [string, string][]> = { ink: COLOURS, tint: TINTS, highlight: HIGHLIGHT_COLOURS, ring: RING_FILLS };
// The row's colours: the user's pins for that kind, else Octet's first ones. room: the swatches the row has for them.
export const pinsOf = (pins: Partial<Record<PinKind, string[]>>, kind: PinKind, room = PIN_MOST) =>
  (pins[kind] ?? PIN_PRESETS[kind].map(([, h]) => h)).slice(0, room);
// A colour pinned: at the end, in the last place when the row is full. Pinned already: no change.
export const pin = (list: string[], hex: string, room = PIN_MOST) => (list.some((h) => same(h, hex)) ? list : [...list.slice(0, room - 1), hex]);
export const unpin = (list: string[], hex: string) => list.filter((h) => !same(h, hex));
export const pinned = (list: string[], hex?: string) => list.some((h) => same(h, hex));

// The user's own colours with one moved from one place to another, and with a colour added (once, at the end).
export const moveColour = (own: Swatch[], from: number, to: number) => { const next = own.filter((_, k) => k !== from); next.splice(to, 0, own[from]); return next; };
export const addColour = (own: Swatch[], hex: string) =>
  own.some((c) => c.hex.toLowerCase() === hex.toLowerCase()) || own.length >= OWN_MOST ? own : [...own, { name: `Colour ${own.length + 1}`, hex }];

// A colour as the browser computes it (rgb(r, g, b), rgba(…) or #rrggbb) as #RRGGBB; undefined for none, a clear
// colour or a gradient.
export function hexOf(css: string): string | undefined {
  const m = /^rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+)(%?))?\)$/.exec(css.trim());
  if (m) return m[4] !== undefined && Number(m[4]) === 0 ? undefined : `#${m.slice(1, 4).map((v) => Math.min(255, Number(v)).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
  return HEX.test(css.trim()) ? css.trim().toUpperCase() : undefined;
}
// Colour by Element is a toggle: whether every heteroatom among these atoms (scope: their indices) has its element's
// colour already, so the command puts them back in the document's ink. by: each element's colour. False with none.
export function elementColoursOn(atoms: { label: string; colour?: string }[], scope: Set<number>, by: Record<string, string>): boolean {
  const own = atoms.filter((a, i) => scope.has(i) && by[a.label]);
  return own.length > 0 && own.every((a) => a.colour?.toLowerCase() === by[a.label].toLowerCase());
}
