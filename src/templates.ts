// The user's own templates for the Ring tool, added by name or from the drawing. Each is kept as an
// .octet file in the settings, so loading one goes through the same checks as opening a file.
import { normalise } from "./edit";
import { parse, serialize } from "./file";
import type { Mol } from "./render";

export type Template = { id: string; name: string; mol: Mol };
export type SavedTemplate = { id: string; name: string; file: string };

// A template's variant name in the Ring tool's list.
export const templateKind = (id: string) => `custom:${id}`;

export function loadTemplates(saved: unknown): Template[] {
  if (!Array.isArray(saved)) return [];
  return saved.flatMap((t: Partial<SavedTemplate>) => {
    try {
      if (typeof t?.id !== "string" || typeof t.name !== "string" || typeof t.file !== "string") return [];
      const mol = parse(t.file);
      return mol.atoms.length ? [{ id: t.id, name: t.name.slice(0, 80), mol }] : [];
    } catch {
      return [];
    }
  });
}

export const newTemplate = (name: string, mol: Mol): SavedTemplate =>
  ({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name, file: serialize({ atoms: normalise(mol).atoms, bonds: mol.bonds }) });
