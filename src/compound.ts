// A compound written as changes to an earlier compound (docs/plans/mcp-v2.md, section 4). In a synthesis almost every
// compound is the one before with one change, so an AI app says the change and Octet makes it on the earlier compound
// as it is drawn: no other atom moves, so the new compound lies as the old one, and a stereocentre the change does not
// touch keeps its wedges. A place is named by a label (a group as it is written, OBn, or a part of the structure that
// is that group) or by a map number the AI app wrote on an atom in a SMILES ([C@H:7]). Octet keeps the number on the
// atom (Atom.tag), never draws it and writes it to no file. A change with more than one reading is refused with the
// places Octet found: it never guesses.
import { bend, bondedTo, bondIndex, bondTo, deleteAtoms, pickAtoms, reach, scaleAt, setBondSpec, setLabel, sprout } from "./edit.ts";
import { GROUPS, isElement, isGeneric, labelSmiles } from "./labels.ts";
import { classes, expandWithOrigins, parseStructure, stereoFacts, stereoLabels, toInchiKey, toSmiles } from "./chem.ts";
import { problems } from "./check.ts";
import type { Mol } from "./render.ts";

// One change: a group for a group ({ swap: { OBn: "OTES" } }, with occurrence when the group is there more than once,
// or at for the one on that atom);
// the group at a place set, a group added there or the group there removed ({ at, set }, { at, add }, { at, remove });
// or a bond's order ({ bond: "5-6", to }).
export type Change = { swap?: Record<string, unknown>; occurrence?: number; at?: string; set?: string; add?: string; remove?: boolean; bond?: string; to?: "single" | "double" | "triple" };
// A group: the atoms on first's side of the one bond from the atom that carries it (on) to first.
type Part = { on: number; first: number; atoms: number[] };

// A structure read from a SMILES: its map numbers become tags, so no map number is drawn or written.
export const tagged = (m: Mol): Mol => (m.atoms.some((a) => a.map) ? { ...m, atoms: m.atoms.map(({ map, ...a }) => (map ? { ...a, tag: map } : a)) } : m);

// The atoms on first's side of the bond from on to first. Undefined when the bond is in a ring (the side comes back to
// on), or when the side has more than `most` atoms.
function side(near: number[][], on: number, first: number, most = Infinity): number[] | undefined {
  const atoms = reach(near, first, on, most);
  return atoms.size > most || near[on].some((j) => j !== first && atoms.has(j)) ? undefined : [...atoms];
}
// A group as an AI app writes it: a label as a chemist types one on an atom (OTBS, CH2OH, Br), after = or # when it is
// on a double or triple bond (=O).
function groupOf(text: unknown): { order: number; label: string } | undefined {
  const x = typeof text === "string" && text.length <= 40 ? /^([=#]?)\s*([^\s\u0000-\u001f\u007f]+)$/.exec(text.trim()) : null;
  return x ? { order: x[1] === "=" ? 2 : x[1] === "#" ? 3 : 1, label: x[2] } : undefined;
}
// The label written on an atom, as a chemist types one. A group's name that is also an element's symbol is the group
// (Ac is acetyl here, not actinium), as it is in a compound's labels.
const written = (m: Mol, i: number, label: string): Mol => (GROUPS[label] ? { ...m, atoms: m.atoms.map((a, k) => (k === i ? { ...a, label: "C", text: label } : a)) } : setLabel(m, i, label));
// A structure with a carbon-9 where the rest of the compound is, as an InChIKey: two groups with one key are the same
// group joined the same way. None for a structure Indigo cannot read.
const CAP = { label: "C", isotope: 9 };
const elements = (atoms: Mol["atoms"]) => atoms.map((a) => a.label).sort().join(" ");
const keyOf = (m: Mol): string | undefined => { try { return toInchiKey(m); } catch { return undefined; } };
// A label's group as that key, its number of atoms, its first atom's element and all its elements in order (none for a
// label Octet cannot read). Kept by label: each is read once.
type Label = { key?: string; atoms: number; first?: string; elements?: string };
const labelKeys = new Map<string, Label>();
function labelKey(label: string, order = 1): Label {
  const id = `${order} ${label}`, had = labelKeys.get(id);
  if (had) return had;
  let out: Label = { atoms: 0 };
  try {
    const smiles = labelSmiles(label), frag = smiles ? parseStructure(smiles, false) : undefined;
    if (frag?.atoms.length) out = { atoms: frag.atoms.length, first: frag.atoms[0].label, elements: elements(frag.atoms), key: keyOf({ atoms: [...frag.atoms, { ...CAP, location: [frag.atoms[0].location[0] - 1, frag.atoms[0].location[1], 0] }], bonds: [...frag.bonds, { type: order, atoms: [frag.atoms.length, 0] }] }) };
  } catch { /* a label Octet cannot read is found by its text alone */ }
  if (labelKeys.size >= 500) labelKeys.clear();
  labelKeys.set(id, out);
  return out;
}

/** `from` with the changes made in order: the new compound, and notes for the AI app on each stereocentre a change
 * touched. Or, as text, why a change cannot be made: nothing is guessed. */
export function change(from: Mol, changes: Change[]): { mol: Mol; notes: string[] } | string {
  if (!changes.length) return { mol: from, notes: [] };
  let m: Mol = { atoms: from.atoms, bonds: from.bonds };
  // For each atom now: the atom of `from` it was (below 0 for a new one, each its own), and whether a change was made
  // at it.
  let was = from.atoms.map((_, i) => i), hit = from.atoms.map(() => false), added = 0;
  const doubled: [number, number][] = []; // double bonds a change made, or put a new group on, by their atoms in `from`
  const notes: string[] = [], note = (t: string) => { if (!notes.includes(t)) notes.push(t); };
  const who = (i: number) => (m.atoms[i].tag ? `atom ${m.atoms[i].tag}` : `atom #${i}`);
  const bondOf = (i: number, j: number) => bondIndex(m, i, j);
  const labelOf = (i: number) => stereoLabels(m)?.atoms[i];
  // What the compound has to name a place by, for a refusal.
  const places = () => {
    const tags = [...new Set(m.atoms.flatMap((a) => (a.tag ? [a.tag] : [])))].sort((p, q) => p - q), labels = [...new Set(m.atoms.flatMap((a) => (a.text ? [a.text] : [])))];
    return `This compound has ${tags.length ? `the atom numbers ${tags.join(", ")}` : "no atom numbers"}${labels.length ? ` and the labels ${labels.join(", ")}` : ""}`;
  };
  // A group as a refusal names it: its label, or its atoms as SMILES.
  const smilesOf = (atoms: number[]) => { try { return toSmiles(pickAtoms(m, atoms)); } catch { return m.atoms[atoms[0]].label; } };
  const say = (p: Part) => {
    const a = m.atoms[p.first];
    return p.atoms.length === 1 && a.text ? a.text : (["", "", "=", "#"][m.bonds[bondOf(p.on, p.first)].type] ?? "") + smilesOf(p.atoms);
  };
  // Atoms taken away. False when more went than these: the last carbon of the compound, left with no bonds.
  const drop = (gone: number[]) => {
    const set = new Set(gone), out = deleteAtoms(m, set);
    if (out.atoms.length !== m.atoms.length - set.size) return false;
    was = was.filter((_, i) => !set.has(i)); hit = hit.filter((_, i) => !set.has(i)); m = out;
    return true;
  };
  const NOTHING = "the change leaves nothing of the compound";
  // An atom by its map number ("7"; "C7" says its element too).
  const atomAt = (name: string): number | string => {
    const x = /^([A-Z][a-z]?)?(\d{1,4})$/.exec(name.trim());
    if (!x) return `${name.slice(0, 40)} is not an atom's number. ${places()}`;
    const found = m.atoms.flatMap((a, i) => (a.tag === Number(x[2]) ? [i] : []));
    if (found.length !== 1) return found.length ? `${found.length} atoms have the number ${x[2]}: give the compound as text, each number once` : `there is no atom numbered ${x[2]}. ${places()}`;
    return x[1] && m.atoms[found[0]].label !== x[1] ? `atom ${x[2]} is ${m.atoms[found[0]].label}, not ${x[1]}` : found[0];
  };
  // Every part of the compound that is this group: a label written so, or atoms that are the label's structure.
  const named = (text: string): Part[] | string => {
    const g = groupOf(text);
    if (!g) return `${String(text).slice(0, 40)} is not a group: give a label (OTBS, CH2OH, =O)`;
    const near = bondedTo(m), want = labelKey(g.label, g.order), out: Part[] = [];
    for (const b of m.bonds) {
      if (b.type !== g.order) continue;
      for (const [on, first] of [b.atoms, [b.atoms[1], b.atoms[0]]]) {
        const same = m.atoms[first].text === g.label, atoms = side(near, on, first, same ? 1 : want.atoms);
        if (!atoms) continue;
        const p = { on, first, atoms };
        // Its InChIKey is asked for only when its atoms could be the label's: the same elements, or a label among them.
        if (same || (want.key && (atoms.some((i) => m.atoms[i].text) || elements(atoms.map((i) => m.atoms[i])) === want.elements) && capped(p) === want.key)) out.push(p);
      }
    }
    return out.sort((p, q) => p.first - q.first);
  };
  const capped = (p: Part) => {
    const piece = pickAtoms(m, [p.on, ...p.atoms]), on = p.atoms.filter((i) => i < p.on).length;
    return keyOf({ atoms: piece.atoms.map((a, i) => (i === on ? { ...CAP, location: a.location } : a)), bonds: piece.bonds.map((b) => (b.atoms.includes(on) ? { type: b.type, atoms: b.atoms } : b)) });
  };
  // The one of them a change means: the only one, or the one occurrence says.
  const one = (parts: Part[] | string, what: string, occurrence?: number): Part | string => {
    if (typeof parts === "string") return parts;
    if (!parts.length) return `there is no ${what.slice(0, 40)}. ${places()}`;
    if (occurrence !== undefined) return parts[occurrence - 1] ?? `there ${parts.length === 1 ? "is 1" : `are ${parts.length}`} ${what}, so no occurrence ${occurrence}`;
    return parts.length === 1 ? parts[0] : `there are ${parts.length} ${what} (on ${parts.map((p) => who(p.on)).join(", ")}): say which with occurrence (1 to ${parts.length}, in the order of the compound's atoms)`;
  };
  // The group an atom carries: its one part through an atom that is not carbon (OH, OTBS, =O, Br), which is the
  // functional group a chemist means; with none, its one carbon part, when the atom has other bonds to stay on (an
  // atom's only bond leads to the rest of the compound, not to a group). A group is the smaller side of its bond: a
  // part with more atoms than stay (the benzoate on an ethyl's carbon) may be what the AI app means to keep.
  const carried = (on: number): Part | string => {
    const near = bondedTo(m), heavy = near[on].filter((j) => m.atoms[j].label !== "H" || m.atoms[j].text);
    const parts = heavy.flatMap((first) => { const atoms = side(near, on, first); return atoms ? [{ on, first, atoms }] : []; });
    const hetero = parts.filter((p) => { const a = m.atoms[p.first]; return (a.text ? labelKey(a.text).first : a.label) !== "C"; });
    const found = hetero.length ? hetero : heavy.length > 1 ? parts : [];
    if (found.length !== 1) return found.length ? `${who(on)} carries ${found.length} groups (${found.map(say).join(", ")}): name the one to change with swap (with at too, the one on this atom)` : `${who(on)} carries no group: add puts a new one on it`;
    const stay = reach(near, on, found[0].first);
    return found[0].atoms.length > stay.size ? `the part on ${who(on)} (${say(found[0])}) is larger than the part that stays (${smilesOf([...stay])}), so it may not be the group you mean: name the group to change with swap` : found[0];
  };
  // A group taken off its atom, which takes a hydrogen. Where the atom is a stereocentre, the hydrogen is drawn in the
  // group's place when the centre reads another way without it.
  const take = (p: Part): string | undefined => {
    const centre = !!labelOf(p.on), rest = p.atoms.filter((i) => i !== p.first), at = (i: number) => i - rest.filter((j) => j < i).length;
    hit[p.on] = true;
    // A group with the opposite charge to its atom's (an N-oxide's O−, an ylide's C−) goes with both charges, and the
    // atom takes no hydrogen: the amine, not its ammonium ion.
    const charge = m.atoms[p.on].charge ?? 0, sign = Math.sign(m.atoms[p.first].charge ?? 0);
    if (charge * sign < 0) {
      m = { ...m, atoms: m.atoms.map((a, i) => (i === p.on ? { ...a, charge: charge + sign || undefined } : a)) };
      return drop(p.atoms) ? undefined : NOTHING;
    }
    m = { ...m, atoms: m.atoms.map((a, i) => (i === p.first ? { label: "H", location: a.location, ...(a.scale ? { scale: a.scale } : {}) } : a)) };
    if (!drop(rest)) return NOTHING;
    const on = at(p.on), first = at(p.first), withH = centre ? labelOf(on) : undefined, kept = [m, was, hit] as const;
    if (!drop([first])) return NOTHING;
    if (withH && labelOf(on - (first < on ? 1 : 0)) !== withH) [m, was, hit] = kept;
    return undefined;
  };
  // A new group, as text. Octet reads a label as it is on a single bond (labels.ts), which is wrong for some labels on
  // a double or triple bond (=CHCO2Et comes out with no C=O): such a label is taken only when it reads the same with
  // the hydrogens a single bond gives its first atom (CH2CO2Et). A label Octet cannot read, and that is no element
  // or generic group (R, X), is drawn as text with no structure, as a chemist's own label is: the reply says so, as it may be a
  // slip (OTBDSP).
  const fresh = (text: unknown): { order: number; label: string } | string => {
    const g = groupOf(text);
    if (!g) return `${String(text).slice(0, 40)} is not a group: give a label (OTBS, CH2OH, =O)`;
    const x = g.order > 1 ? /^([A-Z][a-z]?)(?:H(\d*))?(.*)$/.exec(g.label) : null, h = x ? (x[2] === undefined ? 0 : Number(x[2] || 1)) + g.order - 1 : 0;
    if (x && labelKey(g.label).key !== labelKey(`${x[1]}H${h > 1 ? h : ""}${x[3]}`).key) return `Octet cannot read ${g.label} on a ${g.order === 2 ? "double" : "triple"} bond: give the compound as text`;
    if (!isElement(g.label) && !labelKey(g.label).atoms && !isGeneric(g.label)) note(`Octet cannot read ${g.label} as a group: it is drawn as a label with no structure.`);
    return g;
  };
  // A group put in a part's place: the part's first atom becomes the group's label where it is, on the same bond (with
  // its wedge when the wedge is the carrying atom's), and the rest of the part goes.
  const put = (p: Part, text: unknown): string | undefined => {
    const g = fresh(text);
    if (typeof g === "string") return g;
    if (g.label === "H") return g.order === 1 ? take(p) : "a hydrogen has one bond";
    const k = bondOf(p.on, p.first), b = m.bonds[k];
    if (g.order === 2) doubled.push([was[p.on], was[p.first]]);
    m = setBondSpec(m, k, { type: g.order, ...(g.order === 1 && b.stereo && b.atoms[0] === p.on ? { stereo: b.stereo } : {}) });
    m = written({ ...m, atoms: m.atoms.map((a, i) => (i === p.first ? { label: "C", location: a.location, ...(a.scale ? { scale: a.scale } : {}), ...(a.tag ? { tag: a.tag } : {}) } : a)) }, p.first, g.label);
    hit[p.on] = true;
    return drop(p.atoms.filter((i) => i !== p.first)) ? undefined : NOTHING;
  };
  // A new group on an atom, in place of a hydrogen: one drawn on the atom gives the group its place and its wedge. On
  // a stereocentre with no hydrogen drawn, the new bond goes in a gap between the atom's bonds (the widest first),
  // plain, hashed or wedged: the first that reads as the centre read with its hydrogen.
  const grow = (on: number, text: unknown): string | undefined => {
    const g = fresh(text);
    if (typeof g === "string" || g.label === "H") return typeof g === "string" ? g : "H is not a group to add: give a label (OTBS, CH2OH, =O)";
    const near = bondedTo(m), h = near[on].find((j) => m.atoms[j].label === "H" && !m.atoms[j].text && near[j].length === 1);
    if (h !== undefined) return put({ on, first: h, atoms: [h] }, text);
    const before = g.order === 1 ? labelOf(on) : undefined, base = m, n = base.atoms.length, [x, y] = base.atoms[on].location;
    const angles = near[on].map((j) => Math.atan2(base.atoms[j].location[1] - y, base.atoms[j].location[0] - x)).sort((p, q) => p - q);
    const gaps = angles.map((a, k) => { const gap = (angles[k + 1] ?? angles[0] + 2 * Math.PI) - a; return { gap, way: a + gap / 2 }; }).sort((p, q) => q.gap - p.gap);
    hit[on] = true;
    for (const way of before ? gaps.map((p) => p.way) : [undefined]) for (const stereo of before ? [undefined, 6, 1] : [undefined]) {
      const spec = { type: g.order, ...(stereo ? { stereo } : {}) }, grown = way === undefined ? sprout(base, on, spec) : bondTo(base, on, [x + Math.cos(way) * scaleAt(base, on), y + Math.sin(way) * scaleAt(base, on)], spec);
      if (grown.atoms.length === n) continue; // the new bond met an atom already there
      if (before && stereoLabels(setLabel(grown, n, "H"))?.atoms[on] !== before) continue;
      m = written(grown, n, g.label); was = [...was, -++added]; hit = [...hit, false];
      if (g.order === 2) doubled.push([was[on], was[n]]);
      return undefined;
    }
    return `Octet cannot put a new group on ${who(on)} and keep what is drawn: give the compound as text`;
  };
  // A bond's order. A bond that was triple had its atoms in a line: they turn to the angle of a chain (edit.ts bend).
  const order = (name: string, to: Change["to"]): string | undefined => {
    const ends = name.split("-").map(atomAt), bad = ends.find((e): e is string => typeof e === "string"), type = ({ single: 1, double: 2, triple: 3 } as Record<string, number>)[String(to)];
    if (ends.length !== 2 || bad || !type) return bad ?? "give bond as two atom numbers ('5-6') and to (single, double or triple)";
    const [a, b] = ends as number[], k = bondOf(a, b);
    if (k < 0) return `${who(a)} and ${who(b)} are not bonded. A change cannot make or break a ring or a chain: give the compound as text`;
    const old = m.bonds[k].type;
    m = setBondSpec(m, k, { type });
    hit[a] = hit[b] = true;
    if (type === 2 && old !== 2) doubled.push([was[a], was[b]]);
    if (old === 3 && type < 3) m = bend(m, k);
    return undefined;
  };
  const make = (c: Change): string | undefined => {
    const kinds = (["swap", "set", "add", "remove", "bond"] as const).filter((k) => c[k] !== undefined && c[k] !== false), odd = Object.keys(c).find((k) => !["swap", "occurrence", "at", "set", "add", "remove", "bond", "to"].includes(k));
    if (odd !== undefined) return `${odd.slice(0, 40)} is not part of a change (swap, occurrence, at, set, add, remove, bond, to)`;
    if (kinds.length !== 1) return "give one of swap, set, add, remove: true, or bond with to";
    // A key that does not go with the change is refused, not passed over: it says the AI app meant something else.
    const kind = kinds[0], extra = Object.keys(c).find((k) => !(kind === "bond" ? ["bond", "to"] : [kind, "at", "occurrence"]).includes(k) && c[k as keyof Change] !== false);
    if (extra) return `${extra} does not go with ${kind}`;
    if (c.occurrence !== undefined && !(Number.isInteger(c.occurrence) && c.occurrence >= 1)) return "occurrence counts from 1";
    if (c.bond !== undefined) return typeof c.bond === "string" ? order(c.bond, c.to) : "give bond as two atom numbers ('5-6')";
    if (c.at !== undefined && (typeof c.at !== "string" || !c.at.trim())) return "at is an atom's number, or a group's label";
    // A number is an atom's. An element with a number (C7) is an atom's when an atom has that number: else N3 is a label.
    const at = c.at?.trim(), lettered = at && /^[A-Z][a-z]?(\d+)$/.exec(at), on = at && (/^\d+$/.test(at) || (lettered && m.atoms.some((a) => a.tag === Number(lettered[1])))) ? atomAt(at) : undefined;
    if (typeof on === "string") return on;
    if (c.swap !== undefined) {
      if (!c.swap || typeof c.swap !== "object" || !Object.keys(c.swap).length) return "swap takes {group: new group}, as { OBn: 'OTES' }";
      if (at && on === undefined) return "with swap, at is the number of the atom the group is on";
      for (const [old, to] of Object.entries(c.swap)) {
        // With at, the group of that name on that atom.
        const all = named(old), p = one(typeof all === "string" || on === undefined ? all : all.filter((x) => x.on === on), on === undefined ? old : `${old} on ${who(on)}`, c.occurrence), wrong = typeof p === "string" ? p : put(p, to);
        if (wrong) return wrong;
      }
      return undefined;
    }
    if (!at) return "say where with at: an atom's number, or a group's label";
    if (on !== undefined && c.occurrence !== undefined) return "occurrence goes with a label that is there more than once, not with an atom's number";
    if (c.add !== undefined) return on === undefined ? "add takes an atom's number in at: the atom the new group goes on" : grow(on, c.add);
    const p = on === undefined ? one(named(at), at, c.occurrence) : carried(on);
    return typeof p === "string" ? p : c.remove ? take(p) : put(p, c.set);
  };
  for (const [n, c] of changes.entries()) {
    const wrong = make(c);
    if (wrong) return `changes[${n}]: ${wrong}.`;
  }
  if (!m.atoms.length) return `${NOTHING}.`;
  // Valence: a change that leaves an atom with bonds it cannot have is refused.
  const valence = (x: Mol) => problems(x).filter((p) => p.type === "valence").map((p) => p.message), had = valence(from), has = valence(m);
  if (has.length > had.length) return `The changes break valence: ${has.find((t) => !had.includes(t)) ?? has[0]}${m.atoms.some((a, j) => hit[j] && a.tag && a.radical) ? " (A numbered atom needs its hydrogens in the SMILES, [CH2:7]: with none it is a radical.)" : ""}`;
  // Stereo, by CIP label before and after. A centre that is still one keeps its wedges, so its configuration: its
  // label can change with its groups' priorities, which the reply says of a centre a change was made at. One that is
  // no longer a centre loses its wedges (when no other centre reads them). A new double bond that is drawn E or Z
  // has two readings, which a change cannot tell apart; one to a label is drawn neither way, and when it can be E or
  // Z (each end has one other group, or two that differ, with labels read as their atoms) the reply says so.
  const then = stereoLabels(from), facts = stereoFacts(m), gone = new Set<number>();
  let now = stereoLabels(m), unsetThen: Set<number> | undefined; // the centres of `from` with no configuration: read when one is found now
  for (let j = 0; j < m.atoms.length; j++) {
    const label = now?.atoms[j], old = was[j] >= 0 ? then?.atoms[was[j]] : undefined, name = who(j).replace(/^a/, "A");
    if (old && !label) {
      if (facts.centres.has(j)) return `Octet cannot keep the configuration of ${who(j)} through these changes: give the compound as text.`;
      gone.add(j);
      notes.push(`${name} is no longer a stereocentre.`);
    } else if (old && hit[j]) notes.push(label === old ? `${name} keeps its configuration (${label}).` : `${name} keeps its configuration: its label is now ${label} (was ${old}), as the priorities of its groups changed.`);
    else if (!old && label) notes.push(`${name} is now a stereocentre (${label}, as it is drawn).`);
    else if (!label && facts.unset.has(j) && !(was[j] >= 0 && (unsetThen ??= stereoFacts(from).unset).has(was[j]))) notes.push(`${name} is now a stereocentre with no configuration: to set one, give the compound as text.`);
  }
  if (gone.size) {
    const plain = { ...m, bonds: m.bonds.map((b) => (b.stereo && gone.has(b.atoms[0]) ? { ...b, stereo: undefined } : b)) }, labels = stereoLabels(plain);
    if (JSON.stringify(labels?.atoms) === JSON.stringify(now?.atoms)) [m, now] = [plain, labels];
  }
  for (const [k, b] of m.bonds.entries()) {
    const [p, q] = [was[b.atoms[0]], was[b.atoms[1]]];
    if (b.type !== 2 || !doubled.some(([x, y]) => (x === p && y === q) || (x === q && y === p))) continue;
    if (now?.bonds[k]) return `The new double bond between ${who(b.atoms[0])} and ${who(b.atoms[1])} can be E or Z, and a change cannot say which: give the compound as text.`;
    const [on, group] = m.atoms[b.atoms[0]].text ? [b.atoms[1], b.atoms[0]] : b.atoms, text = m.atoms[group].text;
    if (!text || labelKey(text).atoms < 2) continue; // =O, =CH2: one atom, so no E or Z
    const { mol: x, from: of } = expandWithOrigins(m), near = bondedTo(x), cls = classes(x), i = of.indexOf(on), j = near[i].find((n) => of[n] === group);
    if (j !== undefined && [[i, j], [j, i]].every(([e, o]) => { const rest = near[e].filter((n) => n !== o).map((n) => cls[n]); return rest.length === 1 || (rest.length === 2 && rest[0] !== rest[1]); }))
      notes.push(`The new double bond from ${who(on)} to ${text} is drawn with no E or Z: to set one, give the compound as text.`);
  }
  return { mol: m, notes };
}
