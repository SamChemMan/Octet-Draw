// The .oct file (decision 0004): a CDXML document that ChemDraw opens, with Octet's own drawing (its JSON, see
// file.ts) in a comment after it, beside a hash of the CDXML it was saved with. When another program has changed the
// CDXML, the hash no longer matches, and Octet reads the CDXML instead. Old .octet files are the JSON alone.
import { fromCdxml, toCdxml, type CdxmlOptions } from "./cdxml.ts";
import type { DocStyle } from "./docstyle.ts";
import { parse, serialize } from "./file.ts";
import type { Mol } from "./render.ts";

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

// Base64 of UTF-8, in chunks so a large drawing does not overflow the call stack.
function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromBase64(b64: string): string {
  const s = atob(b64), bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

// The drawing as a .oct (or .cdxml) file: the two are the same.
export function writeOct(mol: Mol, style: DocStyle, opts: CdxmlOptions = {}): string {
  const cdxml = toCdxml(mol, style, opts), body = cdxml.endsWith("\n") ? cdxml : `${cdxml}\n`;
  return `${body}${MARK}${hash(body)} ${toBase64(serialize({ ...mol, style }))}-->\n`;
}

// A drawing from a file: Octet's own drawing when the CDXML around it is unchanged, otherwise the CDXML (with what
// Octet could not hold counted in `lost`, and `foreign` set), or an old .octet file's JSON.
export function readOct(text: string): { mol: Mol; lost: Record<string, number>; foreign?: true } {
  if (/^\s*\{/.test(text)) return { mol: parse(text), lost: {} };
  const at = text.lastIndexOf(MARK);
  if (at >= 0) {
    const m = /^([0-9a-f]{16}) ([A-Za-z0-9+/=]+)-->\s*$/.exec(text.slice(at + MARK.length));
    if (m && hash(text.slice(0, at)) === m[1]) {
      try { return { mol: parse(fromBase64(m[2])), lost: {} }; } catch { /* a damaged copy: read the CDXML */ }
    }
  }
  const read = fromCdxml(text);
  return { mol: { ...read.mol, style: read.style }, lost: read.lost, foreign: true };
}

// What Octet could not hold from a file (readOct's `lost`), as a list: "6 annotations and 1 rotated shape".
export function lostText(lost: Record<string, number>): string {
  const parts = Object.entries(lost).map(([what, n]) => `${n} ${what}${n > 1 && !/s$/.test(what) ? "s" : ""}`);
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0] ?? "";
}
