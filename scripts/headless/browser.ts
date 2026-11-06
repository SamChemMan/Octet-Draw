// What chem.ts takes from a browser, in Node: the drawing tokens (brand/tokens.css), Indigo's wasm and the names
// dictionary by fetch (files in this repository only: Octet reaches no network), and a canvas that measures text.
// Text is measured from the system's Arial (Liberation Sans on Linux, which has Arial's widths), each glyph's advance,
// kerning and box from the font file, as a browser measures it. With no font file, a character is 0.55 em wide, as
// reaction.check.ts measures. A label's outline (chem.ts measurer) is the boxes of its glyphs.
import { existsSync, readFileSync } from "node:fs";

const css = readFileSync(new URL("../../brand/tokens.css", import.meta.url), "utf8"), tokens = new Map<string, string>();
for (const [, name, value] of css.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) if (!tokens.has(name)) tokens.set(name, value.trim());

// ---- Fonts: a TrueType file's advance widths (hmtx), its Unicode map (cmap format 4), glyph boxes (glyf) and pairs
// (kern format 0). Every offset is checked against the file's length.
type Font = { em: number; glyph: (c: number) => number; advance: (g: number) => number; box: (g: number) => [number, number, number, number] | undefined; kern: Map<number, number> };
function readFont(path: string): Font | undefined {
  try {
    const b = readFileSync(path), v = new DataView(b.buffer, b.byteOffset, b.byteLength), u16 = (p: number) => v.getUint16(p), i16 = (p: number) => v.getInt16(p);
    const at = new Map<string, number>();
    for (let i = 0, n = u16(4); i < n; i++) at.set(b.toString("latin1", 12 + 16 * i, 16 + 16 * i), v.getUint32(20 + 16 * i));
    const [head, hhea, hmtx, cmap, loca, glyf, kern] = ["head", "hhea", "hmtx", "cmap", "loca", "glyf", "kern"].map((t) => at.get(t));
    if (head === undefined || hhea === undefined || hmtx === undefined || cmap === undefined) return undefined;
    const em = u16(head + 18), longLoca = i16(head + 50) === 1, metrics = u16(hhea + 34);
    let sub = -1;
    for (let i = 0, n = u16(cmap + 2); i < n; i++) {
      const p = cmap + 4 + 8 * i, o = cmap + v.getUint32(p + 4);
      if ((u16(p) === 0 || (u16(p) === 3 && u16(p + 2) === 1)) && u16(o) === 4) sub = o;
    }
    if (sub < 0) return undefined;
    const segs = u16(sub + 6) / 2, ends = sub + 14, starts = ends + 2 * segs + 2, deltas = starts + 2 * segs, ranges = deltas + 2 * segs;
    const glyph = (c: number) => {
      for (let i = 0; i < segs; i++) {
        if (c > u16(ends + 2 * i)) continue;
        const start = u16(starts + 2 * i), delta = i16(deltas + 2 * i), range = u16(ranges + 2 * i);
        if (c < start) return 0;
        if (!range) return (c + delta) & 0xffff;
        const g = u16(ranges + 2 * i + range + 2 * (c - start));
        return g ? (g + delta) & 0xffff : 0;
      }
      return 0;
    };
    const advance = (g: number) => u16(hmtx + 4 * Math.min(g, metrics - 1));
    const offset = (g: number) => (longLoca ? v.getUint32(loca! + 4 * g) : 2 * u16(loca! + 2 * g));
    const box = (g: number): [number, number, number, number] | undefined => {
      if (loca === undefined || glyf === undefined) return undefined;
      const o = offset(g);
      return o === offset(g + 1) ? undefined : [i16(glyf + o + 2), i16(glyf + o + 4), i16(glyf + o + 6), i16(glyf + o + 8)];
    };
    const pairs = new Map<number, number>();
    if (kern !== undefined && u16(kern) === 0 && u16(kern + 2) > 0 && (u16(kern + 8) & 0xff07) === 0x0001) {
      for (let i = 0, n = u16(kern + 10), p = kern + 18; i < n && p + 6 <= b.length; i++, p += 6) pairs.set(u16(p) * 65536 + u16(p + 2), i16(p + 4));
    }
    return { em, glyph, advance, box, kern: pairs };
  } catch { return undefined; }
}
const DIRS = ["/System/Library/Fonts/Supplemental", "/Library/Fonts", "C:\\Windows\\Fonts", "/usr/share/fonts/truetype/liberation", "/usr/share/fonts/liberation-sans", "/usr/share/fonts/truetype/msttcorefonts"];
const FILES: Record<string, string[]> = {
  sans: ["Arial.ttf", "arial.ttf", "LiberationSans-Regular.ttf"], "sans bold": ["Arial Bold.ttf", "arialbd.ttf", "LiberationSans-Bold.ttf"],
  "sans italic": ["Arial Italic.ttf", "ariali.ttf", "LiberationSans-Italic.ttf"], "sans bold italic": ["Arial Bold Italic.ttf", "arialbi.ttf", "LiberationSans-BoldItalic.ttf"],
  serif: ["Times New Roman.ttf", "times.ttf", "LiberationSerif-Regular.ttf"], "serif bold": ["Times New Roman Bold.ttf", "timesbd.ttf", "LiberationSerif-Bold.ttf"],
  "serif italic": ["Times New Roman Italic.ttf", "timesi.ttf", "LiberationSerif-Italic.ttf"], "serif bold italic": ["Times New Roman Bold Italic.ttf", "timesbi.ttf", "LiberationSerif-BoldItalic.ttf"],
};
const fonts = new Map<string, Font | undefined>();
const fontFor = (key: string) => {
  if (!fonts.has(key)) fonts.set(key, FILES[key].flatMap((f) => DIRS.map((d) => `${d}/${f}`)).filter((p) => existsSync(p)).map(readFont).find(Boolean));
  return fonts.get(key);
};
/** Whether text is measured from a font file (false: 0.55 em a character). */
export const realFonts = () => !!fontFor("sans");

// A CSS font ("italic bold 13.3px Arial, Helvetica, sans-serif"): each glyph's place and box in px, baseline at 0, y down.
type Glyphs = { width: number; boxes: [number, number, number, number][] };
function lay(font: string, text: string): Glyphs {
  const size = parseFloat(/([\d.]+)px/.exec(font)?.[1] ?? "10"), bold = /\bbold\b/.test(font), italic = /\bitalic\b/.test(font);
  const family = font.slice(font.indexOf("px") + 2), serif = /^\s*"?(Times|Georgia|Cambria)/.test(family);
  const f = fontFor(`${serif ? "serif" : "sans"}${bold ? " bold" : ""}${italic ? " italic" : ""}`) ?? fontFor("sans");
  const chars = [...text];
  if (!f) return { width: 0.55 * size * chars.length, boxes: chars.map((_, k) => [0.55 * size * k, -0.72 * size, 0.55 * size * (k + 1), 0.21 * size]) };
  const k = size / f.em, boxes: Glyphs["boxes"] = [];
  let x = 0, last = -1;
  for (const ch of chars) {
    const g = f.glyph(ch.codePointAt(0)!);
    if (last >= 0) x += (f.kern.get(last * 65536 + g) ?? 0) * k;
    const b = f.box(g);
    if (b) boxes.push([x + b[0] * k, -b[3] * k, x + b[2] * k, -b[1] * k]);
    x += f.advance(g) * k;
    last = g;
  }
  return { width: x, boxes };
}

// A canvas 2D context with what chem.ts uses: measureText, and fillText then getImageData for a label's outline.
function canvas() {
  const el = { width: 300, height: 150, getContext: () => g };
  let drawn: [number, number, number, number][] = [];
  const g = {
    font: "10px sans-serif",
    measureText(text: string) {
      const { width, boxes } = lay(g.font, text);
      return { width, actualBoundingBoxAscent: Math.max(0, ...boxes.map((b) => -b[1])), actualBoundingBoxDescent: Math.max(0, ...boxes.map((b) => b[3])), actualBoundingBoxLeft: 0, actualBoundingBoxRight: width };
    },
    fillText(text: string, x: number, y: number) { drawn = lay(g.font, text).boxes.map((b) => [b[0] + x, b[1] + y, b[2] + x, b[3] + y]); },
    getImageData(_x: number, _y: number, w: number, h: number) {
      const data = new Uint8ClampedArray(w * h * 4);
      for (const [x0, y0, x1, y1] of drawn)
        for (let y = Math.max(0, Math.floor(y0)); y < Math.min(h, Math.ceil(y1)); y++)
          for (let x = Math.max(0, Math.floor(x0)); x < Math.min(w, Math.ceil(x1)); x++) data[(y * w + x) * 4 + 3] = 255;
      return { data, width: w, height: h };
    },
  };
  return el;
}

const gl = globalThis as Record<string, unknown>;
gl.window = globalThis;
gl.self = { location: { origin: "file://" } };
gl.document = { documentElement: { style: { setProperty() {} } }, createElement: () => canvas() };
gl.getComputedStyle = () => ({ getPropertyValue: (name: string) => tokens.get(name) ?? "" });
gl.fetch = async (u: URL | string) => {
  const url = new URL(String(u));
  if (url.protocol !== "file:") throw new Error(`Octet reaches no network (${url.protocol})`);
  return new Response(readFileSync(url), { headers: { "content-type": url.pathname.endsWith(".wasm") ? "application/wasm" : "application/octet-stream" } });
};
