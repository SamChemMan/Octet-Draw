// Octet's own file format: versioned, human-readable JSON. Treat every file as hostile: check it fully on read.
import type { Atom, Bond, Caption, Display, Mol } from "./render";

export const FORMAT = "octet";
export const VERSION = 1;
const MAX_ATOMS = 100_000;
const DISPLAYS: Display[] = ["bold", "dashed", "hashed", "wavy", "dative", "hollow"];
const MAX_CAPTIONS = 10_000, MAX_TEXT = 2_000;

export function serialize(mol: Mol): string {
  const atoms = mol.atoms.map((a) => ({ label: a.label, x: round(a.location[0]), y: round(a.location[1]), ...(a.charge ? { charge: a.charge } : {}), ...(a.text ? { text: a.text } : {}) }));
  const bonds = mol.bonds.map((b) => ({ atoms: b.atoms, type: b.type, ...(b.stereo ? { stereo: b.stereo } : {}), ...(b.display ? { display: b.display } : {}), ...(b.position ? { position: b.position } : {}) }));
  // Captions are saved in id order; ids themselves are not saved.
  const captions = [...(mol.captions ?? [])].sort((a, b) => a.id - b.id).map((c) => ({
    text: c.text, x: round(c.x), y: round(c.y), ...(c.bold ? { bold: true } : {}), ...(c.italic ? { italic: true } : {}), ...(c.underline ? { underline: true } : {}),
    ...(c.size ? { size: c.size } : {}), ...(c.align ? { align: c.align } : {}), ...(c.under ? { under: c.under } : {}),
  }));
  return JSON.stringify({ format: FORMAT, version: VERSION, structure: { atoms, bonds }, ...(captions.length ? { captions } : {}) }, null, 1) + "\n";
}
const round = (n: number) => Math.round(n * 1e4) / 1e4;

// Throws an Error with a message for the user if the file is not a drawing this version can read.
export function parse(text: string): Mol {
  let data: unknown;
  try { data = JSON.parse(text); } catch { throw new Error("This file is not an Octet drawing."); }
  const d = data as { format?: unknown; version?: unknown; structure?: { atoms?: unknown; bonds?: unknown }; captions?: unknown };
  if (d?.format !== FORMAT) throw new Error("This file is not an Octet drawing.");
  if (typeof d.version !== "number" || d.version > VERSION) throw new Error("This drawing comes from a newer version of Octet. Update Octet to open it.");
  const atoms = d.structure?.atoms, bonds = d.structure?.bonds;
  if (!Array.isArray(atoms) || !Array.isArray(bonds) || atoms.length > MAX_ATOMS || bonds.length > MAX_ATOMS * 4) throw new Error("This drawing is damaged.");
  const num = (v: unknown) => typeof v === "number" && Number.isFinite(v) && Math.abs(v) < 1e6;
  const int = (v: unknown, lo: number, hi: number) => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;
  const out: Mol = { atoms: [], bonds: [] };
  for (const a of atoms as Record<string, unknown>[]) {
    if (typeof a?.label !== "string" || !/^[A-Z][a-z]{0,2}$/.test(a.label) || !num(a.x) || !num(a.y) || (a.charge !== undefined && !int(a.charge, -9, 9)) || (a.text !== undefined && (typeof a.text !== "string" || a.text.length > 40 || /[\u0000-\u001f<>]/.test(a.text)))) throw new Error("This drawing is damaged.");
    const atom: Atom = { label: a.label, location: [a.x as number, a.y as number, 0] };
    if (a.charge) atom.charge = a.charge as number;
    if (a.text) atom.text = a.text as string;
    out.atoms.push(atom);
  }
  for (const b of bonds as Record<string, unknown>[]) {
    const ends = b?.atoms as unknown[];
    if (!Array.isArray(ends) || ends.length !== 2 || !ends.every((i) => int(i, 0, out.atoms.length - 1)) || ends[0] === ends[1] || !int(b.type, 1, 3) || (b.stereo !== undefined && b.stereo !== 1 && b.stereo !== 6) || (b.display !== undefined && !DISPLAYS.includes(b.display as Display)) || (b.position !== undefined && !["left", "centre", "right"].includes(b.position as string))) throw new Error("This drawing is damaged.");
    const bond: Bond = { type: b.type as number, atoms: [ends[0] as number, ends[1] as number] };
    if (b.stereo) bond.stereo = b.stereo as number;
    if (b.display) bond.display = b.display as Display;
    if (b.position) bond.position = b.position as Bond["position"];
    out.bonds.push(bond);
  }
  if (d.captions === undefined) return out;
  if (!Array.isArray(d.captions) || d.captions.length > MAX_CAPTIONS) throw new Error("This drawing is damaged.");
  out.captions = (d.captions as Record<string, unknown>[]).map((c, k) => {
    const under = c?.under as unknown[] | undefined;
    if (typeof c?.text !== "string" || c.text.length > MAX_TEXT || /[\u0000-\u0009\u000b-\u001f]/.test(c.text) || !num(c.x) || !num(c.y)
      || (c.bold !== undefined && typeof c.bold !== "boolean") || (c.italic !== undefined && typeof c.italic !== "boolean") || (c.underline !== undefined && typeof c.underline !== "boolean")
      || (c.size !== undefined && !(num(c.size) && (c.size as number) >= 4 && (c.size as number) <= 144))
      || (c.align !== undefined && !["left", "centre", "right"].includes(c.align as string))
      || (under !== undefined && (!Array.isArray(under) || !under.length || under.length > out.atoms.length || !under.every((i) => int(i, 0, out.atoms.length - 1))))) throw new Error("This drawing is damaged.");
    const caption: Caption = { id: k + 1, text: c.text, x: c.x as number, y: c.y as number };
    if (c.bold) caption.bold = true;
    if (c.italic) caption.italic = true;
    if (c.underline) caption.underline = true;
    if (c.size !== undefined) caption.size = c.size as number;
    if (c.align) caption.align = c.align as Caption["align"];
    if (under) caption.under = under as number[];
    return caption;
  });
  return out;
}
