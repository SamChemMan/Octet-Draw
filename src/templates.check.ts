// Run: node src/templates.check.ts. The user's own templates (templates.ts): adding a selection to My templates or
// to a set, naming, renaming, moving, removing, the sets themselves, built-in templates kept apart, a built-in copied
// into My templates, and every kind of structure coming back whole from the settings.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { addCaption, extractSelection } from "./edit.ts";
import type { Atom, Bond, Mol } from "./render.ts";
import { addSet, addTo, freeSetName, loadTemplates, moveTemplate, MY_SET, newTemplate, ownId, removeSet, removeTemplate, renameSet, renameTemplate, templateKind, type Kept } from "./templates.ts";

const atom = (label: string, x: number, y: number, more: Partial<Atom> = {}): Atom => ({ label, location: [x, y, 0], ...more });
const bond = (a: number, b: number, type = 1, more: Partial<Bond> = {}): Bond => ({ atoms: [a, b], type, ...more });
// A drawing with every kind of structure a template can hold: a ring with a heteroatom label, a chain with a charge
// and a wedge, and a second fragment (a counter-ion) with a caption under it.
const ring: Mol = { atoms: [0, 1, 2, 3, 4].map((k) => atom(k ? "C" : "O", Math.cos((2 * Math.PI * k) / 5), Math.sin((2 * Math.PI * k) / 5))), bonds: [bond(0, 1), bond(1, 2, 2), bond(2, 3), bond(3, 4, 2), bond(4, 0)] };
const drawing: Mol = (() => {
  const m: Mol = {
    atoms: [...ring.atoms, atom("C", 3, 0), atom("C", 4, 0.5), atom("N", 5, 0, { charge: 1, text: "NH3" }), atom("Cl", 7, 0, { charge: -1 })],
    bonds: [...ring.bonds, bond(5, 6, 1, { stereo: 1 }), bond(6, 7)],
  };
  return addCaption(m, { text: "salt", x: 7, y: -1, under: [8] })[0];
})();
const all = new Set(drawing.atoms.map((_, i) => i));
const empty: Kept = { templates: [], templateSets: [] };

// Adding: a selection goes into My templates, with its name ready to change, and every part of it comes back from the
// settings (which keep JSON).
const whole = extractSelection(drawing, all, new Set(drawing.captions!.map((c) => c.id)));
let s = addTo(empty, newTemplate("  Template 1  ", whole));
assert.equal(s.templates.length, 1);
assert.equal(s.templates[0].name, "Template 1", "the name is trimmed");
assert.equal(s.templates[0].set, undefined, "no set is My templates");
const back = (k: Kept) => loadTemplates(JSON.parse(JSON.stringify(k.templates)));
const t = back(s)[0];
assert.equal(t.mol.atoms.length, drawing.atoms.length);
assert.equal(t.mol.bonds.length, drawing.bonds.length);
assert.deepEqual(t.mol.atoms.map((a) => [a.label, a.charge ?? 0]), drawing.atoms.map((a) => [a.label, a.charge ?? 0]), "labels and charges stay");
assert.equal(t.mol.bonds.find((b) => b.stereo)?.stereo, 1, "the wedge stays");
assert.equal(t.mol.atoms[7].text, "NH3", "a typed label stays");
assert.equal(t.mol.captions?.[0]?.text, "salt", "a caption under the structure stays");
assert.equal(new Set(t.mol.bonds.flatMap((b) => b.atoms)).size, drawing.atoms.length - 1, "two fragments: the chloride has no bond");

// Each kind on its own: a ring, a chain, one charged atom.
for (const part of [new Set([0, 1, 2, 3, 4]), new Set([5, 6, 7]), new Set([8])]) {
  const one = extractSelection(drawing, part, new Set());
  const got = back(addTo(empty, newTemplate("Part", one)))[0];
  assert.equal(got.mol.atoms.length, part.size);
  assert.equal(got.mol.bonds.length, one.bonds.length);
}

// A set: added, and a template added to it. A set that does not exist (or My templates) is My templates.
s = addSet(s, " Mine ");
assert.deepEqual(s.templateSets, ["Mine"]);
assert.equal(addSet(s, "Mine"), s, "the same name twice is one set");
assert.equal(addSet(s, MY_SET), s, "My templates is not a set of its own");
assert.equal(addSet(s, "   "), s, "a set needs a name");
assert.equal(freeSetName(s, "mine2"), true);
assert.equal(freeSetName(s, "Mine"), false);
s = addTo(s, newTemplate("Furan", extractSelection(drawing, new Set([0, 1, 2, 3, 4]), new Set())), "Mine");
assert.equal(s.templates[1].set, "Mine");
assert.equal(addTo(empty, newTemplate("X", ring), "Nowhere").templates[0].set, undefined);
assert.equal(addTo(empty, newTemplate("X", ring, "Mine"), MY_SET).templates[0].set, undefined, "addTo decides the set");
assert.equal(back(s)[1].set, "Mine", "the set is kept in the settings");

// Naming: a new name is trimmed, at most 80 characters; an empty one keeps the old name.
const id = s.templates[1].id;
s = renameTemplate(s, id, " Furan ring ");
assert.equal(s.templates[1].name, "Furan ring");
assert.equal(renameTemplate(s, id, "  "), s);
assert.equal(renameTemplate(s, id, "x".repeat(100)).templates[1].name.length, 80);
assert.equal(renameTemplate(s, "lib:Furan", "Mine"), s, "a built-in template has no id here");

// Moving: to My templates and back to a set.
s = moveTemplate(s, id, MY_SET);
assert.equal(s.templates[1].set, undefined);
s = moveTemplate(s, id, "Mine");
assert.equal(s.templates[1].set, "Mine");
assert.equal(moveTemplate(s, id, "Nowhere").templates[1].set, undefined, "a set that does not exist is My templates");

// A set renamed takes its templates; a set removed gives them to My templates.
s = renameSet(s, "Mine", "Heterocycles of mine");
assert.deepEqual(s.templateSets, ["Heterocycles of mine"]);
assert.equal(s.templates[1].set, "Heterocycles of mine");
assert.equal(renameSet(s, "Heterocycles of mine", MY_SET), s);
const two = addSet(s, "Other");
assert.equal(renameSet(two, "Other", "Heterocycles of mine"), two, "two sets cannot share a name");
s = removeSet(s, "Heterocycles of mine");
assert.deepEqual(s.templateSets, []);
assert.equal(s.templates[1].set, undefined);

// Removing a template.
s = removeTemplate(s, id);
assert.equal(s.templates.length, 1);
assert.equal(back(s).length, 1);

// Built-in templates are not the user's: only custom: kinds have an id, so they cannot be renamed, moved or removed.
assert.equal(ownId("lib:Alanine"), undefined);
assert.equal(ownId(templateKind("abc")), "abc");

// A built-in template copied into My templates is the user's own, with the built-in's name and structure.
type Raw = { name: string; items: { name: string; atoms: (string | number)[][]; bonds: number[][] }[] }[];
const lib: Raw = JSON.parse(readFileSync(new URL("./library.json", import.meta.url), "utf8"));
const furan = lib.flatMap((c) => c.items).find((x) => x.name === "Furan")!;
const furanMol: Mol = { atoms: furan.atoms.map(([l, x, y]) => atom(l as string, x as number, y as number)), bonds: furan.bonds.map(([a, b, type]) => bond(a, b, type)) };
const copied = addTo(empty, newTemplate(furan.name, furanMol));
const own = back(copied)[0];
assert.equal(own.name, "Furan");
assert.equal(own.mol.atoms.length, furan.atoms.length);
assert.ok(ownId(templateKind(own.id)), "the copy has an id of its own");

// The settings' list: anything that is not a template is dropped, and so is a template with nothing in it.
assert.deepEqual(loadTemplates([null, 3, { id: "a", name: "b", file: "not a file" }]), []);
assert.deepEqual(loadTemplates("nothing"), []);

console.log("templates: ok");
