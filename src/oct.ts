// The .oct file (decision 0004): a CDXML document that ChemDraw opens, with Octet's own drawing (its JSON, see
// file.ts) in a comment after it, beside a hash of the CDXML it was saved with. When another program has changed the
// CDXML, the hash no longer matches, and Octet reads the CDXML instead. Old .octet files are the JSON alone.
// A .cdx file (decision 0009) works the same way: the drawing's JSON goes in a property of the CDX document, beside a
// hash of the rest of the file.
import { leftOf, SHOWN_OFF, shownOffText } from "./datafields.ts";
import { fromCdxml, parseXml, toCdxml, type CdxmlOptions } from "./cdxml.ts";
import { BASE64_MAGIC, cdxToXml, fromBase64 as bytesOf, toBase64, xmlToCdx } from "./cdx.ts";
import type { DocStyle } from "./docstyle.ts";
import { parse, serialize } from "./file.ts";
import type { Mol } from "./render.ts";
import { stamped } from "./experiment.ts";

const MARK = "<!--Octet 1 ";

// FNV-1a over the text's UTF-16 units, twice with different seeds: a change check, not a security one.
function hash(text: string): string {
  let a = 0x811c9dc5, b = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ c, 0x01000193) ^ (b >>> 13);
  }
  return (a >>> 0).toString(16).padStart(8, "0") + (b >>> 0).toString(16).padStart(8, "0");
}

// The same hash over bytes.
function hashBytes(b: Uint8Array): string {
  let a = 0x811c9dc5, c = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < b.length; i++) {
    a = Math.imul(a ^ b[i], 0x01000193);
    c = Math.imul(c ^ b[i], 0x01000193) ^ (c >>> 13);
  }
  return (a >>> 0).toString(16).padStart(8, "0") + (c >>> 0).toString(16).padStart(8, "0");
}

// The drawing as a .oct (or .cdxml) file: the two are the same. cdxml: the drawing's CDXML when the caller has it.
// Octet's drawing in a file: with no Author, without Last changed by (experiment.ts stamped), as the CDXML is.
const own = (mol: Mol, style: DocStyle) => serialize({ ...stamped(mol, ""), style });
export function writeOct(mol: Mol, style: DocStyle, opts: CdxmlOptions = {}, cdxml = toCdxml(mol, style, opts)): string {
  const body = cdxml.endsWith("\n") ? cdxml : `${cdxml}\n`;
  return `${body}${MARK}${hash(body)} ${toBase64(new TextEncoder().encode(own(mol, style)))}-->\n`;
}

// The drawing as a .cdx file: ChemDraw's binary form of the CDXML, with Octet's drawing in a user property (tag
// 0x4F43, "OC") first in the document, as the hash of the file without it, a space, and the JSON.
const OWN = 0x4f43;
export function writeCdx(mol: Mol, style: DocStyle, opts: CdxmlOptions = {}): Uint8Array {
  const body = xmlToCdx(parseXml(toCdxml(mol, style, opts))), json = new TextEncoder().encode(`${hashBytes(body)} ${own(mol, style)}`);
  const head = json.length >= 0xffff ? 8 : 4, out = new Uint8Array(body.length + head + json.length), d = new DataView(out.buffer);
  out.set(body.subarray(0, 28));
  d.setUint16(28, OWN, true);
  if (head === 8) { d.setUint16(30, 0xffff, true); d.setUint32(32, json.length, true); } else d.setUint16(30, json.length, true);
  out.set(json, 28 + head);
  out.set(body.subarray(28), 28 + head + json.length);
  return out;
}
// What readOct and readCdx give. fallback: the file has Octet's own drawing for the CDXML or CDX it has, unchanged,
// but Octet cannot read it, so the drawing is the CDXML's (docs/plans/long-text.md); `lost` then counts it as a
// FALLBACK, and the style is Octet's own. foreign: the drawing is the CDXML's or CDX's.
export type Read = { mol: Mol; lost: Record<string, number>; foreign?: true; resaved?: true; fallback?: true };
export const FALLBACK = "part Octet cannot read";
const fellBack = (read: { mol: Mol; lost: Record<string, number> }): Read => ({ ...read, lost: { [FALLBACK]: 1, ...read.lost }, foreign: true, fallback: true });

// A .cdx file: Octet's own drawing when the rest of the file is unchanged, otherwise the CDX as ChemDraw's drawing.
export function readCdx(bytes: Uint8Array): Read {
  if (bytes.length > 36 && bytes[28] === (OWN & 0xff) && bytes[29] === OWN >> 8) {
    const d = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), short = d.getUint16(30, true), head = short === 0xffff ? 8 : 4;
    const n = head === 8 ? d.getUint32(32, true) : short;
    if (28 + head + n <= bytes.length) {
      const own = bytes.subarray(28 + head, 28 + head + n), rest = new Uint8Array(bytes.length - head - n);
      rest.set(bytes.subarray(0, 28));
      rest.set(bytes.subarray(28 + head + n), 28);
      let text: string | undefined;
      try { text = new TextDecoder("utf-8", { fatal: true }).decode(own); } catch { /* a damaged copy: read the CDX */ }
      const cut = text?.indexOf(" ") ?? -1;
      if (text && text.slice(0, cut) === hashBytes(rest)) {
        try { const mol = parse(text.slice(cut + 1)); return { mol, lost: leftOf(mol) }; } catch { return fellBack(cdxRead(bytes)); }
      }
    }
  }
  return { ...cdxRead(bytes), foreign: true };
}
const cdxRead = (bytes: Uint8Array) => { const read = fromCdxml(cdxToXml(bytes)); return { mol: { ...read.mol, style: read.style }, lost: read.lost }; };

// The program that last saved a CDXML file, from its CDXML element: "ChemDraw 25.5.0.5789", or "".
const programOf = (text: string) => /\sCreationProgram="([^"]*)"/.exec(/<CDXML\s[^>]*/.exec(text.slice(0, 65536))?.[0] ?? "")?.[1] ?? "";

// A drawing from a file: Octet's own drawing when the CDXML around it is unchanged, otherwise the CDXML (with what
// Octet could not hold counted in `lost`, and `foreign` set), or an old .octet file's JSON. A .cdx file comes as its
// bytes in base64 (from the app, which reads it). oct: the file is named .oct, so Octet wrote it. `resaved` is set
// when Octet wrote the file (its comment is there, or the name is .oct) and ChemDraw saved it last: ChemDraw 25.5
// drops Octet's comment and attributes when it saves (issue 19), so Octet's own extras are gone.
// A copy Octet cannot read gives `fallback` (see Read).
export function readOct(text: string, oct = false): Read {
  if (text.startsWith(BASE64_MAGIC)) return readCdx(bytesOf(text));
  if (/^\s*\{/.test(text)) { const mol = parse(text); return { mol, lost: leftOf(mol) }; }
  const at = text.lastIndexOf(MARK), read = () => { const r = fromCdxml(text); return { mol: { ...r.mol, style: r.style }, lost: r.lost }; };
  if (at >= 0) {
    const m = /^([0-9a-f]{16}) ([A-Za-z0-9+/=]+)-->\s*$/.exec(text.slice(at + MARK.length));
    if (m && hash(text.slice(0, at)) === m[1]) {
      try { const mol = parse(new TextDecoder("utf-8", { fatal: true }).decode(bytesOf(m[2]))); return { mol, lost: leftOf(mol) }; } catch { return fellBack(read()); }
    }
  }
  const resaved = (at >= 0 || oct) && /ChemDraw/i.test(programOf(text));
  return { ...read(), foreign: true, ...(resaved ? { resaved: true as const } : {}) };
}

// Whether a file's text is a drawing readOct reads (a .oct, CDXML, CDX or an old .octet file), not a structure file
// (MOL, SDF, SMILES), which Indigo reads.
export const isDrawingText = (text: string) => text.startsWith(BASE64_MAGIC) || /^\s*\{/.test(text) || /<CDXML[\s>/]/.test(text.slice(0, 65536));

// What Octet could not hold from a file (readOct's `lost`), as a list: "6 annotations and 1 rotated shape". Its own
// copy it cannot read (FALLBACK) is "Octet's own extras". A data field whose Show a reader turned off (SHOWN_OFF) is
// not lost, so it is not in the list.
export function lostText(lost: Record<string, number>): string {
  const parts = Object.entries(losses(lost)).map(([what, n]) => (what === FALLBACK ? "Octet's own extras" : `${n.toLocaleString("en-GB")} ${what}${n > 1 && !/s$/.test(what) ? "s" : ""}`));
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0] ?? "";
}
// What a reader lost, without what it only changed (SHOWN_OFF): what makes Save ask before it replaces the file.
export const losses = (lost: Record<string, number>) => { const { [SHOWN_OFF]: _, ...rest } = lost; return rest; };
// What Octet says when it opens or adds a drawing (done: "opened", "added"): its own copy it cannot read first (Read
// fallback), then what it left out, then the data fields it no longer shows. "" when nothing is lost or changed.
export function lostNotice(lost: Record<string, number>, done: string): string {
  const { [FALLBACK]: copy, [SHOWN_OFF]: off, ...rest } = lost;
  return [copy ? `Octet cannot read its own copy of this drawing. It ${done} the ChemDraw copy, without Octet's own extras.` : "", Object.keys(rest).length ? `Octet left out ${lostText(rest)}.` : "", off ? shownOffText(off) : ""].filter(Boolean).join(" ");
}
// What Save says before Replace writes over a file it opened with something lost (the Replace dialog).
export function replaceNote(lost: Record<string, number>): string {
  const { [FALLBACK]: copy, ...rest } = losses(lost), n = Object.values(rest).reduce((a, b) => a + b, 0);
  return [
    copy ? "Octet cannot read its own copy of this drawing. Replace removes Octet's own extras from this file." : "",
    n ? `Replace ${copy ? "also removes" : "removes"} ${lostText(rest)}${copy ? "" : " from this file"}, because Octet cannot keep ${n > 1 ? "them" : "it"}.` : "",
    "Save As keeps the original file.",
  ].filter(Boolean).join(" ");
}
