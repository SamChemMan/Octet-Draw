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
// The id of one of the user's templates from its kind, or undefined for a built-in one.
export const ownId = (kind: string) => (kind.startsWith("custom:") ? kind.slice(7) : undefined);
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
  ({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: name.trim().slice(0, 80), file: serialize(normalise(mol)), ...(set && set !== MY_SET ? { set } : {}) });

// What the library changes, as kept in the settings: the user's templates and their named sets (My templates is
// always first and is not listed). Each change gives the settings back unchanged when it cannot be made.
export type Kept = { templates: SavedTemplate[]; templateSets: string[] };
// The set a template goes into: one of the user's sets, else My templates.
const into = (s: Kept, set?: string) => (set && s.templateSets.includes(set) ? set : undefined);
// A template in a set (none: My templates).
const inSet = (t: SavedTemplate, set?: string): SavedTemplate => { const c = { ...t }; delete c.set; return set ? { ...c, set } : c; };

// A template added at the end of a set.
export const addTo = <S extends Kept>(s: S, t: SavedTemplate, set?: string): S => {
  return { ...s, templates: [...s.templates, inSet(t, into(s, set))] };
};
// A template's new name: trimmed, at most 80 characters, never empty.
export const renameTemplate = <S extends Kept>(s: S, id: string, name: string): S => {
  const to = name.trim().slice(0, 80);
  return to && s.templates.some((t) => t.id === id && t.name !== to) ? { ...s, templates: s.templates.map((t) => (t.id === id ? { ...t, name: to } : t)) } : s;
};
export const moveTemplate = <S extends Kept>(s: S, id: string, set: string): S => {
  const to = into(s, set);
  return { ...s, templates: s.templates.map((t) => (t.id === id ? inSet(t, to) : t)) };
};
export const removeTemplate = <S extends Kept>(s: S, id: string): S => ({ ...s, templates: s.templates.filter((t) => t.id !== id) });
// A name a new set can take: not empty, not My templates, not one the user has.
export const freeSetName = (s: Kept, name: string) => { const n = setName(name); return !!n && n !== MY_SET && !s.templateSets.includes(n); };
export const addSet = <S extends Kept>(s: S, name: string): S => (freeSetName(s, name) && s.templateSets.length < 50 ? { ...s, templateSets: [...s.templateSets, setName(name)] } : s);
// A set renamed: its templates go with it.
export const renameSet = <S extends Kept>(s: S, from: string, name: string): S => {
  const to = setName(name);
  if (!s.templateSets.includes(from) || !freeSetName(s, to)) return s;
  return { ...s, templateSets: s.templateSets.map((x) => (x === from ? to : x)), templates: s.templates.map((t) => (t.set === from ? { ...t, set: to } : t)) };
};
// A set removed: its templates go to My templates.
export const removeSet = <S extends Kept>(s: S, name: string): S =>
  ({ ...s, templateSets: s.templateSets.filter((x) => x !== name), templates: s.templates.map((t) => (t.set === name ? inSet(t) : t)) });
