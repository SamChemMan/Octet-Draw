// Run: node src/makeelement.check.ts. Fails loudly if a caption stops turning into its atom the way Sam asked (21 October
// 2026): an element symbol typed as text becomes the atom at once when the page stays the same, and Make element (or a
// bond tool) makes any caption that reads as a label an atom, in the caption's style and in its groups.
import assert from "node:assert/strict";
import { DEFAULT_STYLE } from "./docstyle.ts";
import { addCaption, captionAtom, captionsToAtoms, labelWords, sprout, typedElement } from "./edit.ts";
import type { Mol } from "./render.ts";

// Metals and other elements whose lone atom shows only the symbol become atoms as typed, case as written.
for (const t of ["Rh", "Bi", "Pd", "Fe", "Cu", "Os", "Ru", "Mn", "Na", "K", "Pt", "Ir", "Li"]) assert.ok(typedElement(t), `${t} is typed as an element`);
// Words, labels and other spellings stay text.
for (const t of ["rh", "RH", "Rhodium", "OMe", "NH2", "CO2Et", "Ph", "Rh2", "A", "E", "D", "", "1"]) assert.ok(!typedElement(t), `${t} stays text`);
// An element whose atom alone shows hydrogens (O as H2O, C as CH4, N as NH3) would change the page, so it stays text.
for (const t of ["O", "C", "N", "S", "P", "B", "F", "Cl", "Br", "I", "Si"]) assert.ok(!typedElement(t), `${t} stays text`);

// The atom takes the caption's text, colour, font, size and style; a size or font the same as the labels' stays unset.
const s = { ...DEFAULT_STYLE, labelFont: "Arial", labelSize: 10, captionFont: "Arial", captionSize: 10 };
const atomOf = (...args: Parameters<typeof captionAtom>) => JSON.parse(JSON.stringify(captionAtom(...args))); // unset keys left out
const rh = atomOf({ id: 1, text: "Rh", x: 0, y: 0, colour: "#3F6BFF", bold: true }, [1, 2, 0], s);
assert.deepEqual(rh, { label: "Rh", location: [1, 2, 0], colour: "#3F6BFF", bold: true }, "Rh in its caption's colour and weight");
assert.deepEqual(atomOf({ id: 1, text: "Bi", x: 0, y: 0, font: "Helvetica", size: 12, italic: true, underline: true }, [0, 0, 0], s),
  { label: "Bi", location: [0, 0, 0], font: "Helvetica", size: 12, italic: true, underline: true }, "Bi in its caption's font and size");
// A style all of its runs share counts as the caption's own.
assert.deepEqual(atomOf({ id: 1, text: "Pd", x: 0, y: 0, runs: [{ text: "Pd", bold: true, colour: "#213C99", font: "Helvetica" }] }, [0, 0, 0], s),
  { label: "Pd", location: [0, 0, 0], bold: true, colour: "#213C99", font: "Helvetica" }, "Pd in its runs' style");
// A label that is not one element keeps its text, on the element it joins through.
assert.deepEqual(atomOf({ id: 1, text: "OMe", x: 0, y: 0 }, [0, 0, 0], s), { label: "O", location: [0, 0, 0], text: "OMe" }, "OMe as a label");
assert.equal(labelWords({ atoms: [captionAtom({ id: 1, text: "Rh", x: 0, y: 0 }, [0, 0, 0], s)], bonds: [] }, 0), "Rh", "a lone Rh shows Rh");

// The captions go and their atoms come last; an atom goes into each group its caption was in.
let m: Mol = { atoms: [{ label: "C", location: [0, 0, 0] }], bonds: [] };
let a: number, b: number;
[m, a] = addCaption(m, { text: "Bi", x: 2, y: 0 });
[m, b] = addCaption(m, { text: "Rh", x: 4, y: 0 });
m = { ...m, groups: [{ id: 99, atoms: [0], items: [a] }] };
const out = captionsToAtoms(m, [{ id: a, atom: { label: "Bi", location: [2, 0, 0] } }, { id: b, atom: { label: "Rh", location: [4, 0, 0] } }]);
assert.equal(out.captions?.length ?? 0, 0, "the captions go");
assert.deepEqual(out.atoms.map((x) => x.label), ["C", "Bi", "Rh"], "the atoms come after the drawing's");
assert.deepEqual(out.groups, [{ id: 99, atoms: [0, 1], items: [] }], "Bi takes its caption's place in the group");
// A bond joins the two new atoms as it joins any atoms (the Bi-Rh bond Sam could not draw).
const bonded = sprout(out, 1, { type: 1 });
assert.equal(bonded.bonds.length, 1, "a bond from Bi");

console.log("makeelement ok");
