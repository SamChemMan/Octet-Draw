// The user's own templates for the Ring and Template tools, added by name or from the drawing. Each is kept as an
// .octet file in the settings (Octet's clipboard format), so it keeps everything that was selected (text, arrows,
// shapes, curves, groups, colours) and loading one goes through the same checks as opening a file. set: the named
// set it is in (the library's own category); unset is My templates.
import { normalise } from "./edit.ts";
import { parse, serialize } from "./file.ts";
import type { Mol } from "./render.ts";

export type Template = { id: string; name: string; mol: Mol; set?: string };
export type SavedTemplate = { id: string; name: string; file: string; set?: string };
export const MY_SET = "My templates";

// A template's variant name in the Ring tool's list.
export const templateKind = (id: string) => `custom:${id}`;
// A set's name as it is kept: trimmed, at most 40 characters.
export const setName = (name: string) => name.trim().slice(0, 40);

export function loadTemplates(saved: unknown): Template[] {
  if (!Array.isArray(saved)) return [];
  return saved.flatMap((t: Partial<SavedTemplate>) => {
    try {
      if (typeof t?.id !== "string" || typeof t.name !== "string" || typeof t.file !== "string") return [];
      const mol = parse(t.file), set = typeof t.set === "string" && setName(t.set) && setName(t.set) !== MY_SET ? setName(t.set) : undefined;
      return mol.atoms.length || mol.captions?.length || mol.arrows?.length || mol.shapes?.length ? [{ id: t.id, name: t.name.slice(0, 80), mol, ...(set ? { set } : {}) }] : [];
    } catch {
      return [];
    }
  });
}

export const newTemplate = (name: string, mol: Mol, set?: string): SavedTemplate =>
  ({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name, file: serialize(normalise(mol)), ...(set && set !== MY_SET ? { set } : {}) });
