// ChemDraw template files: a template document (.ctp) and template stationery (.cts, the blank sheet ChemDraw's File >
// Open Templates > New Templates opens). Both are a ChemDraw document (CDX, or CDXML) with a TemplateGrid object
// (0x800B: NumRows, NumColumns, the pane size) and NumRows × NumColumns pages, one for each pane, row by row. A pane's
// name is its page's Name annotation (ChemDraw's Document Annotations > Name), which ChemDraw shows as its tooltip.
// Format facts: decision 0018.
// Each pane with something in it becomes a template of the user's, in a new set named after the file, in the panes'
// order, named by its annotation or else by the set and its place ("Aromatics 7"). Empty panes are left out (Octet's
// sets have no gaps). The file is hostile until read: cdx.ts and cdxml.ts cap
// its size, depth and objects; here the number of panes and the size of each template and of the set are capped too.
import { cdxToXml, BASE64_MAGIC, fromBase64 } from "./cdx.ts";
import { fromCdxml, parseXml, type Xml } from "./cdxml.ts";
import { serialize } from "./file.ts";
import type { Mol } from "./render.ts";
import { hasContent } from "./templates.ts";

export const MOST_PANES = 500; // panes read from one file
export const MOST_TEMPLATE = 256 * 1024; // characters in one template's file (a pane with a large picture is left out)
export const MOST_SET = 2 * 1024 * 1024; // characters in all the templates of one file
export const NOT_TEMPLATES = "This file is not a ChemDraw template file.";

// A file's name is a template file's: .ctp or .cts.
export const isTemplateFile = (name: string) => /\.ct[ps]$/i.test(name.trim());

// What a template file gives: its templates in order (each with its name), the name of the set (the file's name
// without .ctp), and how many panes had something in them but were left out (too big, or not readable).
export type TemplateFile = { set: string; templates: { name: string; mol: Mol }[]; left: number };

// The file as the app reads it (a CDX file's bytes in base64, or CDXML text), or its bytes.
export function readTemplateFile(contents: string | Uint8Array, fileName: string): TemplateFile {
  const root: Xml = typeof contents !== "string" ? cdxToXml(contents) : contents.startsWith(BASE64_MAGIC) ? cdxToXml(fromBase64(contents)) : parseXml(contents);
  if (root.name !== "CDXML" || !root.kids.some((k) => k.name === "templategrid")) throw new Error(NOT_TEMPLATES);
  // The document's colours and fonts go with each pane, as its own document.
  const shared = root.kids.filter((k) => k.name === "colortable" || k.name === "fonttable");
  const pages = root.kids.filter((k) => k.name === "page");
  const templates: TemplateFile["templates"] = [], set = cleanName(fileName.replace(/\.ct[ps]$/i, "")).slice(0, 40) || "Templates";
  let left = Math.max(0, pages.length - MOST_PANES), size = 0;
  pages.slice(0, MOST_PANES).forEach((page) => {
    const named = page.kids.find((x) => x.name === "annotation" && x.attrs.Keyword === "Name")?.attrs.Content;
    const pane: Xml = { ...page, kids: page.kids.filter((x) => !(x.name === "annotation" && x.attrs.Keyword === "Name")) };
    if (!pane.kids.length) return;
    try {
      const mol = fromCdxml({ ...root, kids: [...shared, pane] }).mol;
      if (!hasContent(mol)) return;
      const n = serialize(mol).length;
      if (n > MOST_TEMPLATE || size + n > MOST_SET) { left++; return; }
      size += n;
      templates.push({ name: cleanName(named ?? "") || `${set} ${templates.length + 1}`, mol });
    } catch {
      left++;
    }
  });
  return { set, templates, left };
}

// A name as Octet keeps it: no control characters or line breaks, spaces collapsed, at most 80 characters.
const cleanName = (s: string) => s.replace(/[\u0000-\u001f\u007f-\u009f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
