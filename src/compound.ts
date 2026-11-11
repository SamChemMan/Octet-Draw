// A compound written as changes to an earlier compound (docs/plans/mcp-v2.md, section 4). In a synthesis almost every
// compound is the one before with one change, so an AI app says the change and Octet makes it on the earlier compound
// as it is drawn: no other atom moves, so the new compound lies as the old one, and a stereocentre the change does not
// touch keeps its wedges. A place is named by a label (a group as it is written, OBn, or a part of the structure that
// is that group) or by a map number the AI app wrote on an atom in a SMILES ([C@H:7]). Octet keeps the number on the
// atom (Atom.tag), never draws it and writes it to no file. A change with more than one reading is refused with the
// places Octet found: it never guesses.
import { bend, bondedTo, bondIndex, bondOrders, bondTo, deleteAtoms, deleteBond, flipBond, merge, nextDirection, pickAtoms, pos, reach, ringBonds, scaleAt, setBondSpec, setElement, setLabel, sprout, type P } from "./edit.ts";
import { GROUPS, isElement, isGeneric, labelSmiles } from "./labels.ts";
import { classes, expandWithOrigins, labelHits, parseStructure, stereoFacts, stereoLabels, toInchiKey, toMolfile, toSmiles } from "./chem.ts";
import { problems } from "./check.ts";
import { NAMED, TO, WITH } from "./named.ts";
import { hydrogens, type Mol } from "./render.ts";

// One change: a group for a group ({ swap: { OBn: "OTES" } }, with occurrence when the group is there more than once,
// or at for the one on that atom);
// the group at a place set, a group added there or the group there removed ({ at, set }, { at, add }, { at, remove });
// a bond's order ({ bond: "5-6", to }); or a named transformation ({ do: "oxidise", at: "7" }: TRANSFORMATIONS).
// config, on any change, is the CIP label wanted in the new compound at a stereocentre the changes make or leave with
// no configuration ({ "9": "S" }; "S" alone is for the one atom of at), or E or Z at a new double bond
// ({ "5-6": "E" }). A label has one reading for any structure, as alpha and beta (which need a drawing's convention)
// do not.
export type Change = { swap?: Record<string, unknown>; occurrence?: number; at?: string; set?: string; add?: string; remove?: boolean; bond?: string; to?: "single" | "double" | "triple"; do?: string; with?: string; config?: unknown };
/** The named transformations and what each takes, for an AI app that asks: a tool's own description names `do` only. */
export const TRANSFORMATIONS = `protect, deprotect: with a group (TBS, TBDPS, TES, TMS, TIPS, Bn, PMB, MOM, Ac, Bz, Boc, Cbz, Fmoc) on an O-H or N-H; with acetonide or carbonate, at the two atoms that carry a diol's hydroxyls ('4-5')
acetylate, benzoylate, form_carbonate: protect with Ac, Bz, carbonate
esterify: with the group the O-H takes (Me, Et, Bn, Ac); with no at, the acid's O-H
hydrolyse: an ester or an acetal, as a ketal or a THP ether (the part with the atom at names stays, or the larger part), a lactone, an acetonide, a carbonate, a silyl or MOM ether
oxidise: an alcohol to an aldehyde or ketone, an aldehyde to an acid
reduce: an aldehyde or ketone to an alcohol; an acid, ester or lactone to its alcohols
hydrogenate: a C=C or C#C to a single bond. epoxidise, dihydroxylate: a C=C
hydroborate: at the carbon of a C=C that takes the OH (with: another group, as BBN)
open_epoxide: at the carbon that loses the oxygen (with: the group it takes; none is H)
lactonise: at an acid's or ester's carbon and the atom that carries the O-H ('1-5')
close: a new bond between two atoms ('9-10'; to: single, double or triple). open: a ring bond broken
join: a new bond from this compound's atom to an atom of another ('2-31'; with: that compound's number or id; to as close)
at is an atom's number, a group's label (OTBS: the atom it is on), a kind of place (lactone, ester, acetonide), or two numbers with a hyphen. With no at, the one place the transformation fits.
config, on any change: the label of a new stereocentre ({'9': 'S'}) or double bond ({'5-6': 'E'}) in the new compound.`;
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
export function change(from: Mol, changes: Change[], other?: (name: string) => Mol | string): { mol: Mol; notes: string[] } | string {
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
  // A group's class as chemists say it of an alcohol: 1°, 2° or 3° for the carbons on the carbon that carries it (0
  // when that atom is not a carbon).
  const rank = (p: Part) => (is(p.on, "C") ? Math.min(3, Math.max(1, bondedTo(m)[p.on].filter((j) => j !== p.first && (m.atoms[j].text ? labelKey(m.atoms[j].text!).first : m.atoms[j].label) === "C").length)) : 0);
  const CLASS = /^(?:(both|all)\s+)?(?:([123])°\s*|(prim|sec|tert)[.\s-]\s*|([pst])-)?(\S+)$/, RANKS: Record<string, number> = { prim: 1, sec: 2, tert: 3, p: 1, s: 2, t: 3 }, WORDS = ["", "primary", "secondary", "tertiary"];
  const and = (xs: string[], word = "and") => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} ${word} ${xs[xs.length - 1]}` : xs[0]);
  // The places a group's name means, each changed by act: the only one, the one occurrence says, the one of a class
  // (2° OTBS: also prim, sec, tert, p-, s-, t-), or with both or all each one, as the user says it. A name that is a
  // label whole (t-Bu) is that label. More than one with nothing to pick by is refused with their classes, so the AI
  // app's next call is right.
  const each = (text: string, occurrence: number | undefined, on: number | undefined, to: unknown, act: (p: Part) => string | undefined): string | undefined => {
    const t = text.trim(), x = labelKey(t).atoms || m.atoms.some((a) => a.text === t) ? null : CLASS.exec(t), label = x ? x[5] : t, cls = x ? Number(x[2]) || RANKS[x[3] ?? x[4] ?? ""] : undefined;
    const all = named(label);
    if (typeof all === "string") return all;
    const parts = all.filter((p) => (on === undefined || p.on === on) && (!cls || rank(p) === cls)), what = `${cls ? `${cls}° ` : ""}${label}${on === undefined ? "" : ` on ${who(on)}`}`;
    // The classes it has, said in words: OTBS is on a secondary and a tertiary carbon.
    const here = all.filter((p) => on === undefined || p.on === on), ks = here.map(rank).sort(), where = `${label} is on ${and(ks.map((k) => `a ${WORDS[k]}`))} carbon`;
    if (!parts.length) return cls && here.length && ks.every(Boolean) ? `there is no ${what.slice(0, 40)}: ${where}` : `there is no ${what.slice(0, 40)}. ${places()}`;
    if (x?.[1]) {
      if (x[1] === "both" && parts.length !== 2) return `both is for 2, and there ${parts.length === 1 ? "is 1" : `are ${parts.length}`} ${what}`;
      // Each by its atoms as they were, as a change before it takes atoms away.
      for (const [o, f, ...a] of parts.map((p) => [p.on, p.first, ...p.atoms].map((i) => was[i]))) { const back = (w: number) => was.indexOf(w), wrong = act({ on: back(o), first: back(f), atoms: a.map(back) }); if (wrong) return wrong; }
      note(`Changed ${parts.length} ${what} to ${to ?? "H"}.`);
      return undefined;
    }
    if (occurrence !== undefined) return parts[occurrence - 1] ? act(parts[occurrence - 1]) : `there ${parts.length === 1 ? "is 1" : `are ${parts.length}`} ${what}, so no occurrence ${occurrence}`;
    if (parts.length === 1) return act(parts[0]);
    const alone = [1, 2, 3].filter((k) => ks.filter((y) => y === k).length === 1), many = parts.length === 2 ? "both" : "all";
    return on === undefined && !cls && alone.length && ks.every(Boolean)
      ? `${where}: write ${and(alone.map((k) => `${k}° ${label}`), "or")} for one, or ${many} ${label}${alone.length < parts.length ? `, or say which with occurrence (1 to ${parts.length}, in the order of the compound's atoms)` : ""}`
      : `there are ${parts.length} ${what} (on ${parts.map((p) => who(p.on)).join(", ")}): say which with occurrence (1 to ${parts.length}, in the order of the compound's atoms)${on === undefined ? `, or write ${many} ${what}` : ""}`;
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
    if (k < 0) return `${who(a)} and ${who(b)} are not bonded: bond changes a bond's order. To make a bond, give {do: 'close'} in one compound, or {do: 'join'} to another`;
    return retype(k, type);
  };
  const retype = (k: number, type: number): undefined => {
    const [a, b] = m.bonds[k].atoms, old = m.bonds[k].type;
    m = setBondSpec(m, k, { type });
    hit[a] = hit[b] = true;
    if (type === 2 && old !== 2) doubled.push([was[a], was[b]]);
    if (old === 3 && type < 3) m = bend(m, k);
  };
  // ---- Named transformations (docs/plans/mcp-v2.md, section 4.3). Each finds every place of the compound it fits
  // and is made at the one that at names, or at the only one: with none or more than one, the refusal names them. They
  // are made on the atoms as drawn, with the functions above, so an atom that does not change stays where it is and a
  // centre keeps its wedges (Indigo's WASM build has no reaction templates to run them with). A new atom goes where
  // the bond tool puts one (sprout). The atoms of a new small ring that the transformation adds or re-bonds (an
  // epoxide's O; an acetonide's or carbonate's O, C, O) go on a regular ring. A bond closed between atoms that are not
  // one bond apart, or new atoms that lie on others, have the new ring drawn again alone (ringed); only when that does
  // not work is the compound laid out again, and the reply says so. ----
  const configs: [string, string][] = []; // each label config asks for, by its atom's number or its bond's two
  type Site = { at: number[]; say: string; run: (ats: number[]) => string | undefined };
  const is = (i: number, ...labels: string[]) => !m.atoms[i].text && labels.includes(m.atoms[i].label);
  const hs = (i: number) => (m.atoms[i].text ? 0 : hydrogens(m.atoms[i].label, m.atoms[i].charge ?? 0, bondOrders(m)[i], m.atoms[i].radical) + bondedTo(m)[i].filter((j) => is(j, "H")).length);
  const typeOf = (i: number, j: number) => m.bonds[bondOf(i, j)]?.type;
  const heavy = (near: number[][], i: number) => near[i].filter((j) => !is(j, "H"));
  const ROOM = "there is no room for the new atom: give the compound as text";
  const ORDER: Record<string, number> = { single: 1, double: 2, triple: 3 };
  const PG = ["TBS", "TBDPS", "TES", "TMS", "TIPS", "Bn", "PMB", "MOM", "Ac", "Bz", "Boc", "Cbz", "Fmoc"], DIOL = ["acetonide", "carbonate"];
  // One atom by its number, or two ("4-5").
  const spots = (at: string): number[] | string => {
    const ends = at.split("-").map(atomAt), bad = ends.find((e): e is string => typeof e === "string");
    return bad ?? (ends.length > 2 || ends[0] === ends[1] ? "at is an atom's number, or two with a hyphen ('4-5')" : (ends as number[]));
  };
  // The one place a transformation is made at: the place every atom of at is part of, or of the kind at names.
  let sort: string | undefined;
  const chosen = (name: string, sites: Site[], ats: number[]): string | undefined => {
    const found = sites.filter((s) => ats.every((i) => s.at.includes(i)) && (!sort || s.say.startsWith(`the ${sort} `)));
    if (found.length === 1) return found[0].run(ats);
    return found.length ? `${name} fits ${found.length} places (${found.map((s) => s.say).join("; ")}): say which with at, an atom's number${found.some((s) => !s.at.some((i) => m.atoms[i].tag)) ? " (number an atom in the compound's SMILES to name it, as [CH2:7])" : ""}` : `${name} fits no ${sort ?? "place"} ${ats.length ? `at ${ats.map(who).join(" and ")}` : "in this compound"}. ${places()}`;
  };
  // A new atom on an atom: at a point, or where the bond tool puts it. Where an atom is there already, it goes 60° to
  // one side or the other (the O of a ring just opened is where the bond tool would put the acid's), or a little off
  // the point: the compound is then laid out again (below). None when there is no place.
  const plant = (on: number, label: string, type = 1, at?: P): number | undefined => {
    const n = m.atoms.length, [x, y] = pos(m, on), d = nextDirection(m, on), L = scaleAt(m, on);
    let out = at ? bondTo(m, on, at, { type }) : sprout(m, on, { type });
    for (const q of at ? [[at[0] + 0.15 * L, at[1]], [at[0], at[1] + 0.15 * L]] : [1, -1].map((t) => [x + (d[0] * 0.5 - t * d[1] * 0.866) * L, y + (d[1] * 0.5 + t * d[0] * 0.866) * L])) if (out.atoms.length === n) out = bondTo(m, on, q as P, { type });
    if (out.atoms.length === n) return undefined;
    m = label === "C" ? out : written(out, n, label); was = [...was, -++added]; hit = [...hit, false]; shaped = true;
    return n;
  };
  const link = (a: number, b: number, type = 1): undefined => { m = { ...m, bonds: [...m.bonds, { type, atoms: [a, b] }] }; hit[a] = hit[b] = true; if (type === 2) doubled.push([was[a], was[b]]); };
  const cut = (a: number, b: number): string | undefined => {
    const out = deleteBond(m, bondOf(a, b));
    if (out.atoms.length !== m.atoms.length) return NOTHING;
    m = out; hit[a] = hit[b] = true;
    return undefined;
  };
  // The shortest way from a to b along bonds other than their own: with their bond, a ring.
  const way = (near: number[][], a: number, b: number): number[] | undefined => {
    const prev = new Map([[a, a]]);
    for (let todo = [a]; todo.length && !prev.has(b);) todo = todo.flatMap((i) => near[i].filter((j) => !prev.has(j) && !(i === a && j === b) && !!prev.set(j, i)));
    if (!prev.has(b)) return undefined;
    const path = [b];
    while (path[0] !== a) path.unshift(prev.get(path[0])!);
    return path;
  };
  // A double bond of an aromatic ring: each atom of its smallest ring has a double bond that is in a ring (its own, or
  // the ring fused to it), or is N, O or S.
  const aromatic = (near: number[][], [a, b]: number[], inRing: boolean[]) => { const ring = way(near, a, b); return !!ring && ring.length <= 7 && ring.every((i) => is(i, "N", "O", "S") || m.bonds.some((x, k) => x.type === 2 && inRing[k] && x.atoms.includes(i))); };
  // Where the new atoms of a ring go. The ring is a path of atoms that stay (bonded in order) and `free` more from the
  // path's last atom round to its first: they go on the arc of a regular ring through the path's two ends, on the side
  // away from the path's other atoms and the ends' other bonds (with as many on each side, the side `now`, the atoms
  // that move there, is on). A ring on one bond that is in no ring goes on the side with more room, when one has.
  const round = (path: number[], free: number, now: number[] = []): P[] => {
    const A = pos(m, path[0]), B = pos(m, path[path.length - 1]), n = path.length + free, half = ((free + 1) * Math.PI) / n, near = bondedTo(m);
    const mid: P = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2], nx = A[1] - B[1], ny = B[0] - A[0], chord = Math.hypot(nx, ny) || 1, R = chord / (2 * Math.sin(half)), step = (2 * Math.PI) / n;
    const sides = (atoms: number[]) => Math.sign(atoms.reduce((sum, i) => sum + Math.sign((pos(m, i)[0] - mid[0]) * nx + (pos(m, i)[1] - mid[1]) * ny), 0));
    const on = (s: number): P[] => {
      const k = (-R * Math.cos(half) * s) / chord, O: P = [mid[0] + k * nx, mid[1] + k * ny], from = Math.atan2(B[1] - O[1], B[0] - O[0]), at = (t: number): P => [O[0] + R * Math.cos(from + t * step), O[1] + R * Math.sin(from + t * step)];
      // One step from B one way is A, the other the first new atom: go the way that is not A.
      const turn = Math.hypot(at(1)[0] - A[0], at(1)[1] - A[1]) > Math.hypot(at(-1)[0] - A[0], at(-1)[1] - A[1]) ? 1 : -1;
      return Array.from({ length: free }, (_, i) => at(turn * (i + 1)));
    };
    const clear = (pts: P[]) => Math.min(...pts.flatMap((p) => m.atoms.flatMap((_, i) => (path.includes(i) || now.includes(i) ? [] : [Math.hypot(pos(m, i)[0] - p[0], pos(m, i)[1] - p[1])]))), Infinity);
    const [left, right] = [on(1), on(-1)], space = path.length === 2 && !ringBonds(m)[bondOf(path[0], path[1])] ? clear(left) - clear(right) : 0;
    if (Math.abs(space) > 0.2 * chord) return space > 0 ? left : right;
    // The side away from the path's other atoms and bonds, unless an atom is there and the other side has more room.
    const pick = (-sides([...path.slice(1, -1), ...[path[0], path[path.length - 1]].flatMap((i) => near[i]).filter((j) => !path.includes(j) && !now.includes(j))]) || sides(now) || 1) > 0 ? left : right, other = pick === left ? right : left;
    return clear(pick) < 0.5 * scaleAt(m, path[0]) && clear(other) > clear(pick) ? other : pick;
  };
  // Stereocentres drawn so that each reads as the label wanted: its own wedges turned over, or a wedge or a hash on one
  // of its single bonds (a bond to a group before a ring bond, and a bond to another centre last). The first that gives
  // the label and leaves every other centre and double bond reading as it does is kept.
  const settle = (wants: Map<number, string>): string | undefined => {
    const pending = new Set(wants.keys());
    for (const [i, want] of wants) {
      pending.delete(i);
      const now = stereoLabels(m);
      if (now?.atoms[i] === want) continue;
      const near = bondedTo(m), ring = ringBonds(m), own = (b: Mol["bonds"][number]) => (b.stereo === 1 || b.stereo === 6) && b.atoms[0] === i;
      const plain: Mol = { ...m, bonds: m.bonds.map((b) => (own(b) ? { ...b, stereo: undefined } : b)) };
      const rank = (k: number) => { const j = m.bonds[k].atoms.find((x) => x !== i)!; return (now?.atoms[j] || pending.has(j) ? 4 : 0) + (ring[k] ? 2 : 0) + (near[j].length > 1 ? 1 : 0); };
      const tries = [
        ...(m.bonds.some(own) ? [{ ...m, bonds: m.bonds.map((b) => (own(b) ? { ...b, stereo: 7 - b.stereo! } : b)) }] : []),
        ...near[i].map((j) => bondOf(i, j)).filter((k) => m.bonds[k].type === 1 && !(m.bonds[k].stereo && m.bonds[k].atoms[0] !== i)).sort((p, q) => rank(p) - rank(q))
          .flatMap((k) => [1, 6].map((stereo) => setBondSpec(plain.bonds[k].atoms[0] === i ? plain : flipBond(plain, k), k, { type: 1, stereo }))),
      ];
      const found = tries.find((t) => { const l = stereoLabels(t); return l?.atoms[i] === want && t.atoms.every((_, j) => j === i || pending.has(j) || l.atoms[j] === now?.atoms[j]) && t.bonds.every((_, k) => l.bonds[k] === now?.bonds[k]); });
      if (!found) return `Octet cannot draw ${who(i)} as ${want}: it may not be a stereocentre in this compound. Give the compound as text`;
      m = found;
    }
    return undefined;
  };
  // After atoms moved: each centre drawn to read as it did in old (the compound with its atoms where they were).
  const kept = (old: Mol): string | undefined => {
    const then = stereoLabels(old)?.atoms ?? [], now = stereoLabels(m)?.atoms ?? [];
    return settle(new Map(then.flatMap((l, i) => (l && l !== now[i] ? [[i, l] as [number, string]] : []))));
  };
  // The atoms of move turned over about the line through a and b: a wedge on them becomes a hash, so each centre
  // there keeps its configuration.
  const over = (a: number, b: number, move: Set<number>): Mol => {
    const [ax, ay] = pos(m, a), [ux, uy] = [pos(m, b)[0] - ax, pos(m, b)[1] - ay], uu = ux * ux + uy * uy || 1;
    const at = ([x, y]: number[]): [number, number, number] => { const t = ((x - ax) * ux + (y - ay) * uy) / uu; return [2 * (ax + t * ux) - x, 2 * (ay + t * uy) - y, 0]; };
    return { ...m, atoms: m.atoms.map((x, i) => (move.has(i) ? { ...x, location: at(x.location) } : x)), bonds: m.bonds.map((bd) => ((bd.stereo === 1 || bd.stereo === 6) && move.has(bd.atoms[0]) ? { ...bd, stereo: 7 - bd.stereo } : bd)) };
  };
  // A new ring drawn regular, and only it and what it carries move. With the ring's bonds taken out, the largest part
  // of the compound stays where it is, the ring's other atoms go on the regular ring through its atoms there (round),
  // and each other part goes with its atoms on the ring. False when that does not work: the part that stays has atoms
  // on the ring that are not one run, an atom would lie on another, or a bond would not be a bond's length.
  const ringed = (cycle: number[]): boolean => {
    const n = cycle.length, at = new Map(cycle.map((i, k) => [i, k])), L = scaleAt(m, cycle[0]), base = m, old = (i: number) => pos(base, i);
    const near = bondedTo({ ...m, bonds: m.bonds.filter((b) => { const [p, q] = b.atoms.map((i) => at.get(i)); return p === undefined || q === undefined || ((p - q + n) % n !== 1 && (q - p + n) % n !== 1); }) }), parts: Set<number>[] = [];
    for (const i of cycle) if (!parts.some((p) => p.has(i))) parts.push(reach(near, i, -1));
    const stay = parts.reduce((p, q) => (q.size > p.size ? q : p));
    // Its atoms on the ring are one run round the ring: the run first.
    const s = cycle.findIndex((i, k) => stay.has(i) && !stay.has(cycle[(k + n - 1) % n])), k = cycle.filter((i) => stay.has(i)).length, run = cycle.slice(s).concat(cycle.slice(0, s));
    if (s < 0 || run.slice(0, k).some((i) => !stay.has(i))) return false;
    // On one atom, the ring goes in the widest gap between its other bonds (or 30° to one side), either way round.
    const [ax, ay] = old(run[0]), angles = near[run[0]].map((j) => Math.atan2(old(j)[1] - ay, old(j)[0] - ax)).sort((p, q) => p - q);
    const gap = angles.reduce((w, a, t) => { const g = (angles[t + 1] ?? angles[0] + 2 * Math.PI) - a; return g > w[0] ? [g, a + g / 2] : w; }, [0, 0]), R = L / (2 * Math.sin(Math.PI / n));
    // Of the ways that leave no atom on another, the one whose labels meet fewest bonds and labels, when that is no
    // more than the compound had.
    let best: Mol | undefined, fewest = labelHits(from) + 1;
    for (const [turn, tilt] of k > 1 ? [[0, 0]] : [1, -1].flatMap((t) => [0, 1, -1].map((d) => [t, (d * Math.PI) / 6]))) {
      const way = gap[1] + tilt, pts = k > 1 ? round(run.slice(0, k), n - k, run.slice(k)) : Array.from({ length: n - 1 }, (_, t): P => [ax + R * Math.cos(way) + R * Math.cos(way + Math.PI + (turn * (t + 1) * 2 * Math.PI) / n), ay + R * Math.sin(way) + R * Math.sin(way + Math.PI + (turn * (t + 1) * 2 * Math.PI) / n)]);
      const to = new Map(run.slice(k).map((i, t) => [i, pts[t]])), all = run.map((i) => to.get(i) ?? old(i)), mid = [0, 1].map((c) => all.reduce((sum, p) => sum + p[c], 0) / n);
      // Each part in turn, the largest first, as the fit that comes least near the atoms placed before it. A part on
      // ring atoms fits them (turned or turned over); a part on one atom points out from the ring's middle, or up to
      // 90° to one side, either way over.
      const atoms = base.atoms.map((a) => ({ ...a })), flip = new Set<number>(), placed: P[] = [...[...stay].map(old), ...pts];
      let fits = true;
      for (const part of [...parts].sort((p, q) => q.size - p.size)) {
        const ends = [...part].filter((i) => to.has(i)), rest = [...part].filter((i) => !to.has(i));
        if (part === stay || !ends.length) continue;
        const [o, q] = ends.length > 1 ? [ends.map(old), ends.map((i) => to.get(i)!)] : [[old(ends[0]), rest.length ? [0, 1].map((c) => rest.reduce((sum, i) => sum + old(i)[c], 0) / rest.length) : old(ends[0])], [to.get(ends[0])!, [2 * to.get(ends[0])![0] - mid[0], 2 * to.get(ends[0])![1] - mid[1]]]];
        const c0 = ends.length > 1 ? [0, 1].map((c) => o.reduce((sum, p) => sum + p[c], 0) / o.length) : o[0], c1 = ends.length > 1 ? [0, 1].map((c) => q.reduce((sum, p) => sum + p[c], 0) / q.length) : q[0];
        const tries = [1, -1].flatMap((sy) => {
          const u = o.map((p) => [p[0] - c0[0], sy * (p[1] - c0[1])]), v = q.map((p) => [p[0] - c1[0], p[1] - c1[1]]), t = Math.atan2(u.reduce((sum, p, i) => sum + p[0] * v[i][1] - p[1] * v[i][0], 0), u.reduce((sum, p, i) => sum + p[0] * v[i][0] + p[1] * v[i][1], 0));
          return (ends.length > 1 ? [0] : [0, 1, -1, 2, -2, 3, -3]).map((d) => {
            const [cs, sn] = [Math.cos(t + (d * Math.PI) / 6), Math.sin(t + (d * Math.PI) / 6)], move = (p: number[]): [number, number, number] => { const [x, y] = [p[0] - c0[0], sy * (p[1] - c0[1])]; return [c1[0] + x * cs - y * sn, c1[1] + x * sn + y * cs, 0]; };
            const off = Math.max(0, ...ends.map((i) => Math.hypot(move(old(i))[0] - to.get(i)![0], move(old(i))[1] - to.get(i)![1]))), crowd = rest.reduce((sum, i) => { const [x, y] = move(old(i)); return sum + placed.reduce((s2, p) => s2 + Math.max(0, 0.6 * L - Math.hypot(p[0] - x, p[1] - y)), 0); }, 0);
            return { sy, move, off, crowd };
          });
        }).filter((x) => x.off <= 0.1 * L).sort((x, y) => x.crowd - y.crowd);
        if (!tries.length) { fits = false; break; }
        for (const i of part) atoms[i] = { ...atoms[i], location: to.has(i) ? [...to.get(i)!, 0] as [number, number, number] : tries[0].move(old(i)) };
        for (const i of rest) placed.push([atoms[i].location[0], atoms[i].location[1]]);
        if (tries[0].sy < 0) for (const i of part) flip.add(i);
      }
      if (!fits) continue;
      m = { ...base, atoms, bonds: base.bonds.map((b) => ((b.stereo === 1 || b.stereo === 6) && flip.has(b.atoms[0]) ? { ...b, stereo: 7 - b.stereo } : b)) };
      if (!crowded((i) => m.atoms[i].location !== base.atoms[i].location) && !kept(base)) { const hits = labelHits(m); if (hits < fewest) [best, fewest] = [m, hits]; }
      m = base;
    }
    if (best) m = best;
    return !!best;
  };
  // An atom that moved (or is new) within half a bond of an atom it is not bonded to, or on a bond that is not about a
  // bond's length.
  const crowded = (moved: (i: number) => boolean) => {
    const far = (i: number, j: number) => Math.hypot(pos(m, i)[0] - pos(m, j)[0], pos(m, i)[1] - pos(m, j)[1]) / scaleAt(m, i);
    return m.bonds.some((b) => b.atoms.some(moved) && (far(b.atoms[0], b.atoms[1]) < 0.7 || far(b.atoms[0], b.atoms[1]) > 1.4)) || m.atoms.some((_, i) => moved(i) && m.atoms.some((_q, j) => j !== i && far(i, j) < 0.5 && bondOf(i, j) < 0));
  };
  // A new double bond drawn E or Z: as it is, or with the smaller side of the bond turned over.
  const geometry = (a: number, b: number, want: string): string | undefined => {
    const k = bondOf(a, b), now = stereoLabels(m);
    if (k < 0 || m.bonds[k].type !== 2) return `${who(a)} and ${who(b)} have no double bond`;
    if (now?.bonds[k] === want) return undefined;
    const near = bondedTo(m), [sa, sb] = [reach(near, a, b), reach(near, b, a)], move = sb.size <= sa.size ? sb : sa, cannot = `Octet cannot draw the double bond between ${who(a)} and ${who(b)} as ${want}`;
    if (!now?.bonds[k] || ringBonds(m)[k]) return `${cannot}${now?.bonds[k] ? `: it is ${now.bonds[k]} in its ring` : ": it has no E or Z as it is drawn (a label is drawn neither way)"}. Give the compound as text`;
    const out = over(a, b, move), l = stereoLabels(out);
    if (l?.bonds[k] !== want || out.atoms.some((_, i) => l.atoms[i] !== now.atoms[i])) return `${cannot} and keep what is drawn. Give the compound as text`;
    m = out;
    return undefined;
  };

  // A label in a label's place, for each label atom that test fits: CH2OH to CHO.
  const relabel = (test: RegExp, to: (text: string) => string): Site[] => {
    const near = bondedTo(m);
    return m.atoms.flatMap((a, i): Site[] => (a.text && test.test(a.text) && near[i].length === 1 ? [{ at: [i, near[i][0]], say: `${a.text} on ${who(near[i][0])}`, run: () => (labelKey(to(a.text!)).atoms ? put({ on: near[i][0], first: i, atoms: [i] }, to(a.text!)) : `Octet cannot read ${to(a.text!)} as a group`) }] : []));
  };
  // Each O-H, N-H and S-H (with acids, each acid's O-H alone), to take a group in place of its hydrogen: an atom at the
  // end of a chain becomes the label a chemist writes (OTBS, NHBoc), and one in a chain or ring takes the group on it.
  const free = (group: string, acids: boolean): Site[] => {
    const near = bondedTo(m);
    return [...m.atoms.flatMap((_, x): Site[] => {
      const on = heavy(near, x);
      if (!is(x, "O", "N", "S") || !hs(x) || (acids && !(is(x, "O") && on.length === 1 && near[on[0]].some((j) => j !== x && is(j, "O") && typeOf(on[0], j) === 2)))) return [];
      return [{ at: [x, ...on], say: `${m.atoms[x].label}-H on ${who(on[0] ?? x)}`, run: () => {
        const label = `${m.atoms[x].label}${is(x, "N") ? "H" : ""}${group}`;
        return on.length !== 1 || (is(x, "N") && hs(x) !== 2) ? grow(x, group) : labelKey(label).atoms ? put({ on: on[0], first: x, atoms: [x, ...near[x].filter((j) => is(j, "H"))] }, label) : `Octet cannot read ${label} as a group`;
      } }];
    }), ...relabel(acids ? /^(CO2|COO)H$/ : /([OS]H|NH2)$/, (text) => text.replace(/H2?$/, (h) => (h === "H2" ? "H" : "")) + group)];
  };
  // Each group of that name on an O, N or S (drawn atom by atom when drawn is set, or in a label that ends with it,
  // OTBS, CH2OBn, NHBoc), to come off for a hydrogen.
  const off = (group: string, drawn = true): Site[] => {
    const parts = drawn ? named(group) : [], near = bondedTo(m);
    return [...(typeof parts === "string" ? [] : parts).filter((p) => is(p.on, "O", "N", "S")).map((p): Site => ({ at: [p.on, ...near[p.on].filter((j) => j !== p.first)], say: `${group} on the ${m.atoms[p.on].label} of ${who(near[p.on].find((j) => j !== p.first) ?? p.on)}`, run: () => take(p) })),
      ...relabel(new RegExp(`([OS]|NH?)${group}$`), (text) => { const stem = text.slice(0, -group.length); return stem + (stem.endsWith("NH") ? "2" : "H"); })];
  };
  // Each acetonide or carbonate of a diol: the carbon between two oxygens of one ring, with two methyls or an =O.
  const bridges = (kind: string): Site[] => {
    const near = bondedTo(m);
    return m.atoms.flatMap((_, c): Site[] => {
      const os = near[c].filter((j) => is(j, "O") && near[j].length === 2 && typeOf(c, j) === 1), rest = near[c].filter((j) => !os.includes(j));
      if (!is(c, "C") || os.length !== 2 || !reach(near, os[0], c).has(os[1]) || !(kind === "acetonide" ? rest.length === 2 && rest.every((j) => is(j, "C") && near[j].length === 1) : rest.length === 1 && is(rest[0], "O") && typeOf(c, rest[0]) === 2)) return [];
      const on = os.map((o) => near[o].find((j) => j !== c)!);
      return [{ at: [c, ...os, ...on], say: `the ${kind} on ${on.map(who).join(" and ")}`, run: () => { for (const i of on) hit[i] = true; return drop([c, ...rest]) ? undefined : NOTHING; } }];
    });
  };
  // A diol's acetonide or carbonate made: the two O-H and a new carbon close a ring with the atoms between a and b.
  const bridge = (kind: string, a: number, b: number): string | undefined => {
    const near = bondedTo(m), xs = [a, b].map((i) => near[i].filter((j) => is(j, "O") && hs(j) && near[j].length === 1 && typeOf(i, j) === 1)), bad = xs.findIndex((x) => x.length !== 1);
    if (bad >= 0) return `${who([a, b][bad])} carries ${xs[bad].length || "no"} O-H: ${kind} takes at, the two atoms that carry a diol's hydroxyls ('4-5')`;
    const path = bondOf(a, b) >= 0 ? [a, b] : way(near, a, b);
    if (!path) return `${who(a)} and ${who(b)} are not in one structure`;
    const [xa, xb] = [xs[0][0], xs[1][0]], before = m.atoms, [pb, pc, pa] = round(path, 3, [xa, xb]);
    m = { ...m, atoms: m.atoms.map((x, i) => (i === xa || i === xb ? { ...x, location: [...(i === xa ? pa : pb), 0] as [number, number, number] } : x)) };
    const c = plant(xb, "C", 1, pc);
    if (c === undefined) return ROOM;
    link(xa, c); hit[a] = hit[b] = true; rings.push([...path, xb, c, xa].map((i) => was[i]));
    if (kind === "acetonide" ? plant(c, "C") === undefined || plant(c, "C") === undefined : plant(c, "O", 2) === undefined) return ROOM;
    return kept({ ...m, atoms: m.atoms.map((x, i) => (i === xa || i === xb ? before[i] : x)) });
  };
  // Each C=O carbon with no other atom but carbon, hydrogen and at most one O: c, its =O (o), an acid's or ester's
  // O (x) and the atom that O is on (r).
  const carbonyls = () => {
    const near = bondedTo(m);
    return m.atoms.flatMap((_, c) => {
      const o = near[c].filter((j) => is(j, "O") && typeOf(c, j) === 2 && near[j].length === 1), x = near[c].filter((j) => !o.includes(j) && !is(j, "C", "H"));
      return is(c, "C") && o.length === 1 && (!x.length || (x.length === 1 && is(x[0], "O") && typeOf(c, x[0]) === 1)) ? [{ c, o: o[0], x: x[0] as number | undefined, r: x.length ? heavy(near, x[0]).find((j) => j !== c) : undefined }] : [];
    });
  };
  // The part of an ester that stays when its C-O bond is broken: the part with an atom at names, else the larger.
  // Both stay when the bond is in a ring (a lactone).
  const stays = (c: number, x: number, r: number, ats: number[]): string => {
    const near = bondedTo(m), acid = reach(near, c, x), rest = reach(near, x, c), named = [ats.some((i) => acid.has(i)), ats.some((i) => i !== x && rest.has(i))];
    return acid.has(r) ? "ring" : named[0] !== named[1] ? (named[0] ? "acid" : "alcohol") : acid.size !== rest.size ? (acid.size > rest.size ? "acid" : "alcohol") : `the two parts of the ester at ${who(c)} are of one size: name an atom of the part that stays with at`;
  };
  // Each ester hydrolysed; or, with reduce, each aldehyde, ketone, acid and ester reduced to its alcohols.
  const acyls = (reduce: boolean): Site[] => carbonyls().filter((s) => reduce || s.r !== undefined).map(({ c, o, x, r }): Site => ({
    at: [c, o, ...(x === undefined ? [] : [x]), ...(r === undefined ? [] : [r])], say: `the ${x === undefined ? "C=O" : r === undefined ? "acid" : reach(bondedTo(m), c, x).has(r) ? "lactone" : "ester"} at ${who(c)}`,
    run: (ats) => {
      const keep = x === undefined ? "" : r === undefined ? "acid" : stays(c, x, r, ats), rest = () => [...reach(bondedTo(m), x!, c)];
      if (keep === "alcohol") return take({ on: x!, first: c, atoms: [...reach(bondedTo(m), c, x!)] });
      if (!["", "ring", "acid"].includes(keep)) return keep;
      if (!reduce) return keep === "ring" ? cut(c, x!) ?? (plant(c, "O") === undefined ? ROOM : undefined) : put({ on: c, first: x!, atoms: rest() }, "OH");
      return put({ on: c, first: o, atoms: [o] }, "OH") ?? (keep === "ring" ? cut(c, x!) : keep ? take({ on: c, first: x!, atoms: rest() }) : undefined);
    },
  }));
  // Each acetal (a ketal, a THP ether) that no other site has: a carbon with no O but two on single bonds, each on
  // another carbon. Hydrolysed, its C-O bonds break: the carbon takes an =O and each O an H. The part that stays is
  // the one with an atom at names, else the largest (the carbon's part counts its new O); of two of one size, Octet
  // does not choose.
  const acetals = (others: Site[]): Site[] => {
    const near = bondedTo(m), taken = new Set(others.flatMap((s) => s.at));
    return m.atoms.flatMap((_, c): Site[] => {
      const os = near[c].filter((j) => is(j, "O")), rs = os.map((o) => heavy(near, o).find((j) => j !== c)!);
      if (!is(c, "C") || os.length !== 2 || os.some((o) => typeOf(c, o) !== 1 || heavy(near, o).length !== 2) || rs.some((r) => !is(r, "C")) || [c, ...os].some((i) => taken.has(i))) return [];
      return [{ at: [c, ...os, ...rs], say: `the acetal at ${who(c)}`, run: (ats) => {
        const apart = bondedTo({ ...m, bonds: m.bonds.filter((b) => !(b.atoms.includes(c) && b.atoms.some((i) => os.includes(i)))) }), parts: Set<number>[] = [];
        for (const i of [c, ...os]) if (!parts.some((p) => p.has(i))) parts.push(reach(apart, i, -1));
        const size = (p: Set<number>) => p.size + (p.has(c) ? 1 : 0), named = parts.filter((p) => ats.some((i) => p.has(i))), most = Math.max(...parts.map(size));
        const keep = named.length === 1 ? named[0] : parts.filter((p) => size(p) === most).length === 1 ? parts.find((p) => size(p) === most)! : undefined;
        if (!keep) return `the parts of the acetal at ${who(c)} are of one size: name an atom of the part that stays with at`;
        hit[c] = true;
        if (!keep.has(c)) return drop(m.atoms.flatMap((_a, i) => (keep.has(i) ? [] : [i]))) ? undefined : NOTHING;
        // The carbon's =O is an O that goes with its part, where it is; or a new O, when both O stay.
        const o = os.find((i) => !keep.has(i));
        for (const i of os) if (i !== o) cut(c, i);
        if (o === undefined) return plant(c, "O", 2) === undefined ? ROOM : undefined;
        retype(bondOf(c, o), 2);
        return drop(m.atoms.flatMap((_a, i) => (keep.has(i) || i === o ? [] : [i]))) ? undefined : NOTHING;
      } }];
    });
  };
  // Each C=C (and, with triple, C≡C) that is not in an aromatic ring.
  const alkenes = (name: string, run: (a: number, b: number, ats: number[]) => string | undefined, ats: number[], triple = false) => {
    const near = bondedTo(m), inRing = ringBonds(m);
    return chosen(name, m.bonds.flatMap((b): Site[] => ((b.type === 2 || (triple && b.type === 3)) && b.atoms.every((i) => is(i, "C")) && !aromatic(near, b.atoms, inRing) ? [{ at: b.atoms, say: `the C${b.type === 2 ? "=" : "#"}C of ${who(b.atoms[0])} and ${who(b.atoms[1])}`, run: (named) => run(b.atoms[0], b.atoms[1], named) }] : [])), ats);
  };
  // The compound laid out again, as one read from a file is: for a ring closed between atoms that are far apart, and
  // for new atoms that lie on others, when the new ring cannot be drawn alone (ringed). Indigo lays out a MOL file of it (which keeps the order of its atoms and bonds;
  // each label is one atom there, a carbon of its own mass, so two labels are two groups) and draws the wedges, so
  // each centre keeps its configuration. The reply says that the atoms moved.
  let shaped = false, relaid = false; // a transformation placed or moved atoms; the compound was laid out again
  const loose: [number, number][] = []; // each bond that closed a ring between atoms far apart, as was has them
  const rings: number[][] = []; // each new ring, by its atoms as was has them, for ringed
  const redrawn = (): string | undefined => {
    const old = m, L = scaleAt(m, 0), then = stereoLabels(m)?.atoms ?? [];
    let laid: Mol | undefined;
    try { laid = parseStructure(toMolfile({ atoms: m.atoms.map((a, i) => (a.text ? { label: "C", isotope: 20 + i, location: a.location } : a)), bonds: m.bonds })); } catch { /* refused below */ }
    // (The layout may draw a hydrogen at a centre: such atoms come after the compound's own.)
    const n = m.atoms.length, extra = laid?.atoms.slice(n) ?? [];
    if (!laid || laid.atoms.length < n || extra.some((a) => a.label !== "H") || m.bonds.some((b, k) => !laid!.bonds[k]?.atoms.every((i) => b.atoms.includes(i)))) return "Octet cannot draw the compound again after this change: give the compound as text";
    const mean = (atoms: Mol["atoms"], k: number) => atoms.slice(0, n).reduce((sum, a) => sum + a.location[k], 0) / n, [x0, y0, x1, y1] = [mean(old.atoms, 0), mean(old.atoms, 1), mean(laid.atoms, 0), mean(laid.atoms, 1)];
    // Turned, and mirrored when that fits better, to lie as the compound did: the turn that puts its atoms nearest
    // where they were (a mirror turns each wedge over, so each centre keeps its configuration).
    const fits = [1, -1].map((s) => {
      const uv = laid!.atoms.map((a) => [(a.location[0] - x1) * L, s * (a.location[1] - y1) * L]), xy = old.atoms.map((a) => [a.location[0] - x0, a.location[1] - y0]);
      const t = Math.atan2(xy.reduce((sum, [x, y], i) => sum + uv[i][0] * y - uv[i][1] * x, 0), xy.reduce((sum, [x, y], i) => sum + uv[i][0] * x + uv[i][1] * y, 0)), [c, sn] = [Math.cos(t), Math.sin(t)];
      const at = uv.map(([u, v]): [number, number, number] => [x0 + u * c - v * sn, y0 + u * sn + v * c, 0]);
      return { s, at, off: xy.reduce((sum, [x, y], i) => sum + (at[i][0] - x0 - x) ** 2 + (at[i][1] - y0 - y) ** 2, 0) };
    }), best = fits[1].off < fits[0].off ? fits[1] : fits[0];
    m = { atoms: laid.atoms.map((a, i) => ({ ...(old.atoms[i] ?? a), location: best.at[i] })), bonds: laid.bonds.map((b, k) => ({ ...(old.bonds[k] ?? b), atoms: b.atoms, stereo: best.s < 0 && (b.stereo === 1 || b.stereo === 6) ? 7 - b.stereo : b.stereo })) };
    was = [...was, ...extra.map(() => -++added)]; hit = [...hit, ...extra.map(() => false)]; relaid = true;
    note("Octet drew the compound again: its atoms moved.");
    const now = stereoLabels(m)?.atoms ?? [];
    return settle(new Map(then.flatMap((l, i) => (l && l !== now[i] ? [[i, l] as [number, string]] : []))));
  };
  // A bond made between two atoms of the compound: a ring closed. An end that is on one atom only (the O-H that
  // closes a lactone or a cyclic ether) goes on the regular ring through the others, which stay. When the new bond, or
  // that end's own, is then far from a bond's length, the compound is laid out again.
  const close = (a: number, b: number, type: number): string | undefined => {
    const near = bondedTo(m), ring = way(near, a, b), end = [b, a].find((i) => heavy(near, i).length === 1);
    if (bondOf(a, b) >= 0 || !ring) return bondOf(a, b) >= 0 ? `${who(a)} and ${who(b)} are bonded: bond changes a bond's order` : `${who(a)} and ${who(b)} are not in one structure`;
    link(a, b, type); shaped = true;
    const old = m, far = (i: number, j: number) => { const d = Math.hypot(pos(m, i)[0] - pos(m, j)[0], pos(m, i)[1] - pos(m, j)[1]) / scaleAt(m, i); return d < 0.7 || d > 1.4; };
    if (end !== undefined) { const [at] = round(end === b ? ring.slice(0, -1) : ring.slice(1), 1, [end]); m = { ...m, atoms: m.atoms.map((x, i) => (i === end ? { ...x, location: [at[0], at[1], 0] as [number, number, number] } : x)) }; }
    rings.push(ring.map((i) => was[i]));
    if (!far(a, b) && (end === undefined || !far(end, near[end][0]))) return kept(old);
    m = old; loose.push([was[a], was[b]]);
    return undefined;
  };
  // A bond from an atom of this compound to an atom of another. The other compound is put in its place when every
  // change is made (placed, below): a later change may take off a group that is in the bond's way.
  const joins: [number, number][] = []; // the two atoms of each such bond, as was has them
  const join = (c: Change): string | undefined => {
    const add = c.with === undefined || !other ? "join takes with: the other compound's number or id" : other(c.with), type = ORDER[String(c.to ?? "single")];
    if (typeof add === "string" || !type) return typeof add === "string" ? add.replace(/\.$/, "") : "to is single, double or triple";
    const base = m.atoms.length, both = add.atoms.find((a) => a.tag && m.atoms.some((x) => x.tag === a.tag))?.tag;
    if (both) return `the two compounds each have an atom numbered ${both}: give each atom its own number`;
    m = merge(m, { atoms: add.atoms, bonds: add.bonds }, [0, 0]); was = [...was, ...add.atoms.map(() => -++added)]; hit = [...hit, ...add.atoms.map(() => false)];
    const ends = spots(c.at ?? "");
    if (typeof ends === "string" || ends.length !== 2 || ends[0] < base === ends[1] < base) return typeof ends === "string" ? ends : "join takes at: an atom of this compound and an atom of the other ('2-31'). close makes a bond in one compound";
    const [a, b] = ends[0] < base ? ends : [ends[1], ends[0]];
    joins.push([was[a], was[b]]); shaped = true;
    return link(a, b, type);
  };
  // Each joined compound put where the bond tool would put a new atom on each of the bond's two atoms: its atom one
  // bond away, the bond in the next free direction of both. Of that place, the places with the bond 60° to one side or
  // the other, and the mirror image of each about the bond, the one that leaves its atoms farthest from the rest.
  const placed = () => {
    for (const [wa, wb] of joins) {
      const a = was.indexOf(wa), b = was.indexOf(wb), k = bondOf(a, b), near = bondedTo(m), move = k < 0 ? new Set<number>() : reach(near, b, a);
      if (k < 0 || near[a].some((j) => j !== b && move.has(j))) continue; // the bond is gone, or in a ring
      const apart = { ...m, bonds: m.bonds.filter((_, n) => n !== k) }, d = nextDirection(apart, a), e = nextDirection(apart, b), L = scaleAt(m, a), base = m, [bx, by] = pos(m, b);
      const gap = (x: Mol) => Math.min(...[...move].flatMap((i) => x.atoms.flatMap((p, j) => (move.has(j) ? [] : [Math.hypot(p.location[0] - x.atoms[i].location[0], p.location[1] - x.atoms[i].location[1])]))));
      let best = -1, out = base;
      for (const side of [0, 1, -1]) {
        const way = Math.atan2(d[1], d[0]) + (side * Math.PI) / 3, turn = way + Math.PI - Math.atan2(e[1], e[0]), [cs, sn] = [Math.cos(turn), Math.sin(turn)], [tx, ty] = [pos(base, a)[0] + Math.cos(way) * L, pos(base, a)[1] + Math.sin(way) * L];
        m = { ...base, atoms: base.atoms.map((x, i) => (move.has(i) ? { ...x, location: [tx + (x.location[0] - bx) * cs - (x.location[1] - by) * sn, ty + (x.location[0] - bx) * sn + (x.location[1] - by) * cs, 0] as [number, number, number] } : x)) };
        // The mirror image keeps its wedges turned over with its atoms, so each centre keeps its configuration.
        for (const x of [m, over(a, b, move)]) if (gap(x) > best + 1e-6) [best, out] = [gap(x), x];
        if (best >= 0.5 * L) break;
      }
      m = out;
    }
  };
  const protect = (name: string, group: string | undefined, ats: number[]) => (DIOL.includes(group!) ? (ats.length === 2 ? bridge(group!, ats[0], ats[1]) : `${group} takes at: the two atoms that carry a diol's hydroxyls ('4-5')`) : PG.includes(group!) ? chosen(name, free(group!, false), ats) : `${name} takes with: ${[...PG, ...DIOL].join(", ")}`);
  const DO: Record<(typeof NAMED)[number], (c: Change, ats: number[]) => string | undefined> = {
    protect: (c, ats) => protect("protect", c.with, ats),
    deprotect: (c, ats) => (DIOL.includes(c.with!) ? chosen("deprotect", bridges(c.with!), ats) : PG.includes(c.with!) ? chosen("deprotect", off(c.with!), ats) : `deprotect takes with: ${[...PG, ...DIOL].join(", ")}`),
    acetylate: (_, ats) => protect("acetylate", "Ac", ats),
    benzoylate: (_, ats) => protect("benzoylate", "Bz", ats),
    form_carbonate: (_, ats) => protect("form_carbonate", "carbonate", ats),
    esterify: (c, ats) => (c.with && labelKey(c.with).atoms ? chosen("esterify", free(c.with, !ats.length), ats) : "esterify takes with: the group the O-H takes (Me, Et, Bn, Ac)"),
    hydrolyse: (_, ats) => { const sites = [...acyls(false), ...relabel(/^(CO2|COO)(?!H$)./, () => "CO2H"), ...["Ac", "Bz"].flatMap((g) => off(g, false)), ...["TBS", "TBDPS", "TES", "TMS", "TIPS", "MOM"].flatMap((g) => off(g)), ...DIOL.flatMap(bridges)]; return chosen("hydrolyse", [...sites, ...acetals(sites)], ats); },
    oxidise: (_, ats) => {
      const near = bondedTo(m);
      return chosen("oxidise", [
        ...m.atoms.flatMap((_x, c): Site[] => (is(c, "C") && hs(c) ? near[c].filter((x) => is(x, "O") && typeOf(c, x) === 1 && heavy(near, x).length === 1 && hs(x)).map((x) => ({ at: [c, x], say: `the O-H on ${who(c)}`, run: () => put({ on: c, first: x, atoms: [x, ...near[x].filter((j) => j !== c)] }, "=O") })) : [])),
        ...carbonyls().filter((s) => s.x === undefined && hs(s.c)).map(({ c, o }): Site => ({ at: [c, o], say: `the aldehyde at ${who(c)}`, run: () => grow(c, "OH") })),
        ...relabel(/^CH2OH$/, () => "CHO"), ...relabel(/^CHO$/, () => "CO2H")], ats);
    },
    reduce: (_, ats) => chosen("reduce", [...acyls(true), ...relabel(/^CHO$|^(CO2|COO)./, () => "CH2OH")], ats),
    hydrogenate: (_, ats) => alkenes("hydrogenate", (a, b) => retype(bondOf(a, b), 1), ats, true),
    epoxidise: (_, ats) => alkenes("epoxidise", (a, b) => {
      retype(bondOf(a, b), 1);
      const o = plant(a, "O", 1, round([a, b], 1)[0]);
      if (o === undefined) return ROOM;
      rings.push([a, b, o].map((i) => was[i]));
      return link(b, o);
    }, ats),
    dihydroxylate: (_, ats) => alkenes("dihydroxylate", (a, b) => retype(bondOf(a, b), 1) ?? grow(a, "OH") ?? grow(b, "OH"), ats),
    hydroborate: (c, ats) => (ats.length === 1 ? alkenes("hydroborate", (a, b) => retype(bondOf(a, b), 1) ?? grow(ats[0], c.with ?? "OH"), ats) : "hydroborate takes at: the carbon of the C=C that takes the OH"),
    open_epoxide: (c, ats) => {
      const near = bondedTo(m);
      return chosen("open_epoxide", m.atoms.flatMap((_x, x): Site[] => (is(x, "O") && near[x].length === 2 && bondOf(near[x][0], near[x][1]) >= 0 ? [{ at: [x, ...near[x]], say: `the epoxide on ${near[x].map(who).join(" and ")}`, run: () => {
        const on = near[x].filter((i) => ats.includes(i));
        if (on.length !== 1) return "open_epoxide takes at: the carbon that loses the oxygen";
        const wrong = cut(on[0], x);
        if (wrong) return wrong;
        // The carbon's own wedges go (when no other centre reads them): what comes in comes from the other side, so
        // the centre is not what its wedges said. config sets it.
        const plain: Mol = { ...m, bonds: m.bonds.map((b) => (b.stereo && b.atoms[0] === on[0] ? { ...b, stereo: undefined } : b)) }, [l0, l1] = [stereoLabels(m)?.atoms, stereoLabels(plain)?.atoms];
        if (m.atoms.every((_a, i) => i === on[0] || l0?.[i] === l1?.[i])) m = plain;
        return c.with ? grow(on[0], c.with) : undefined;
      } }] : [])), ats);
    },
    lactonise: (_, ats) => {
      const near = bondedTo(m), acyl = carbonyls().filter((s) => s.x !== undefined && ats.includes(s.c)), on = ats.find((i) => i !== acyl[0]?.c);
      const xs = on === undefined ? [] : is(on, "O") && hs(on) ? [on] : near[on].filter((j) => is(j, "O") && hs(j) && typeOf(on, j) === 1);
      if (ats.length !== 2 || acyl.length !== 1 || xs.length !== 1) return "lactonise takes at: an acid's or ester's carbon and the atom that carries the O-H ('1-5')";
      const { c, x } = acyl[0], gone = side(near, c, x!);
      return gone ? close(c, xs[0], 1) ?? take({ on: c, first: x!, atoms: gone }) : `the ester at ${who(c)} is in a ring`;
    },
    close: (c, ats) => (ats.length === 2 && ORDER[String(c.to ?? "single")] ? close(ats[0], ats[1], ORDER[String(c.to ?? "single")]) : "close takes at: two atoms ('9-10'), and to (single, double or triple)"),
    open: (_, ats) => (ats.length !== 2 || bondOf(ats[0], ats[1]) < 0 ? "open takes at: the two atoms of a ring bond ('9-10')" : ringBonds(m)[bondOf(ats[0], ats[1])] ? cut(ats[0], ats[1]) : `the bond between ${who(ats[0])} and ${who(ats[1])} is not in a ring: a change cannot make two compounds of one`),
    join,
  };
  const make = (c: Change): string | undefined => {
    const kinds = (["swap", "set", "add", "remove", "bond", "do"] as const).filter((k) => c[k] !== undefined && c[k] !== false), odd = Object.keys(c).find((k) => !["swap", "occurrence", "at", "set", "add", "remove", "bond", "to", "do", "with", "config"].includes(k));
    if (odd !== undefined) return `${odd.slice(0, 40)} is not part of a change (swap, occurrence, at, set, add, remove, bond, to, do, with, config)`;
    if (kinds.length !== 1) return "give one of swap, set, add, remove: true, bond with to, or do";
    // A key that does not go with the change is refused, not passed over: it says the AI app meant something else.
    const kind = kinds[0], goes = kind === "bond" ? ["bond", "to"] : kind === "do" ? ["do", "at", ...(WITH.includes(String(c.do)) ? ["with"] : []), ...(TO.includes(String(c.do)) ? ["to"] : [])] : [kind, "at", "occurrence"];
    const extra = Object.keys(c).find((k) => k !== "config" && !goes.includes(k) && c[k as keyof Change] !== false);
    if (extra) return `${extra} does not go with ${kind === "do" ? String(c.do).slice(0, 40) : kind}`;
    // config: each label wanted, by its atom's number (or its bond's two): made when every change is, as a label is
    // of the whole compound.
    if (c.config !== undefined) {
      const all = typeof c.config === "string" ? { [String(c.at)]: c.config } : c.config;
      if (!all || typeof all !== "object" || Object.entries(all).some(([k, v]) => !/^\d{1,4}(-\d{1,4})?$/.test(k) || !(k.includes("-") ? /^[EZ]$/ : /^[RSrs]$/).test(String(v)))) return "config takes {atom's number: 'R' or 'S'} or {bond: 'E' or 'Z'}, as {'9': 'S', '5-6': 'E'}";
      configs.push(...Object.entries(all as Record<string, string>));
    }
    if (c.occurrence !== undefined && !(Number.isInteger(c.occurrence) && c.occurrence >= 1)) return "occurrence counts from 1";
    if (c.bond !== undefined) return typeof c.bond === "string" ? order(c.bond, c.to) : "give bond as two atom numbers ('5-6')";
    if (c.at !== undefined && (typeof c.at !== "string" || !c.at.trim())) return "at is an atom's number, or a group's label";
    // A number is an atom's. An element with a number (C7) is an atom's when an atom has that number: else N3 is a label.
    const at = c.at?.trim(), lettered = at && /^[A-Z][a-z]?(\d+)$/.exec(at), on = at && (/^\d+$/.test(at) || (lettered && m.atoms.some((a) => a.tag === Number(lettered[1])))) ? atomAt(at) : undefined;
    if (typeof on === "string") return on;
    if (c.do !== undefined) {
      if (!(NAMED as readonly string[]).includes(String(c.do))) return `${String(c.do).slice(0, 40)} is not a transformation. They are: ${NAMED.join(", ")}`;
      if (c.with !== undefined && (typeof c.with !== "string" || !c.with.trim() || c.with.length > 40)) return "with is a group's label, or a compound's number";
      // An O-H, S-H or N-H that an earlier change wrote as a label (OH) is that atom: a transformation reads atoms.
      m.atoms.forEach((x, i) => { if (x.text && /^(OH|SH|NH2?)$/.test(x.text)) m = setElement(m, i, x.label); });
      // at as a label (OTBS) is the atom the label is on, as it is for set, add and remove.
      const parts = !at || c.do === "join" || on !== undefined || at.includes("-") ? undefined : named(at);
      // at as a kind of place (lactone, ester, acetonide), as a chemist names it: the places of that kind.
      sort = Array.isArray(parts) && !parts.length && /^[a-z]+$/.test(at!) ? at : undefined;
      const ats = c.do === "join" || !at || sort ? [] : !parts ? (on !== undefined ? [on] : spots(at)) : typeof parts === "string" ? parts : parts.length === 1 ? [parts[0].on] : parts.length ? `there are ${parts.length} ${at.slice(0, 40)} (on ${parts.map((p) => who(p.on)).join(", ")}): give at as the number of the atom the group is on` : `there is no ${at.slice(0, 40)}. ${places()}`;
      if (typeof ats === "string") return ats;
      // A transformation says what it does at a centre (a group goes on or comes off an O; a centre is made or goes),
      // so the reply has no word on a centre that keeps its configuration, as it has for set, add and remove.
      const had = new Set(was.filter((_, i) => hit[i])), wrong = DO[c.do as (typeof NAMED)[number]](c, ats);
      hit = was.map((w) => had.has(w));
      return wrong;
    }
    if (c.swap !== undefined) {
      if (!c.swap || typeof c.swap !== "object" || !Object.keys(c.swap).length) return "swap takes {group: new group}, as { OBn: 'OTES' }";
      if (at && on === undefined) return "with swap, at is the number of the atom the group is on";
      for (const [old, to] of Object.entries(c.swap)) {
        // With at, the group of that name on that atom.
        const wrong = each(old, c.occurrence, on, to, (p) => put(p, to));
        if (wrong) return wrong;
      }
      return undefined;
    }
    if (!at) return "say where with at: an atom's number, or a group's label";
    if (on !== undefined && c.occurrence !== undefined) return "occurrence goes with a label that is there more than once, not with an atom's number";
    if (c.add !== undefined) return on === undefined ? "add takes an atom's number in at: the atom the new group goes on" : grow(on, c.add);
    const act = (p: Part) => (c.remove ? take(p) : put(p, c.set));
    if (on === undefined) return each(at, c.occurrence, undefined, c.set, act);
    const p = carried(on);
    return typeof p === "string" ? p : act(p);
  };
  for (const [n, c] of changes.entries()) {
    const wrong = make(c);
    if (wrong) return `changes[${n}]: ${wrong}.`;
  }
  if (!m.atoms.length) return `${NOTHING}.`;
  // Valence: a change that leaves an atom with bonds it cannot have is refused.
  const valence = (x: Mol) => problems(x).filter((p) => p.type === "valence").map((p) => p.message), had = valence(from), has = valence(m);
  if (has.length > had.length) return `The changes break valence: ${has.find((t) => !had.includes(t)) ?? has[0]}${m.atoms.some((a, j) => hit[j] && a.tag && a.radical) ? " (A numbered atom needs its hydrogens in the SMILES, [CH2:7]: with none it is a radical.)" : ""}`;
  placed();
  // An atom a transformation placed or moved that lies within half a bond of an atom it is not bonded to: the compound
  // is laid out again, as a crowded structure read from text is (mcp.ts).
  // A new ring is drawn again first (ringed), and only when that does not work the whole compound.
  const moved = (i: number) => was[i] < 0 || m.atoms[i].location !== from.atoms[was[i]].location || loose.some((b) => b.includes(was[i]));
  if (shaped && !relaid && crowded(moved)) {
    const before = m;
    for (const r of rings) { const cycle = r.map((w) => was.indexOf(w)); if (!cycle.includes(-1) && crowded(moved)) ringed(cycle); }
    if (crowded(moved)) {
      m = before;
      const wrong = redrawn();
      if (wrong) return `${wrong}.`;
    }
  }
  // config: each new double bond turned to the E or Z asked for, then each centre drawn to read as its label.
  const wants = new Map<number, string>(), turned = new Set<number>();
  for (const [name, label] of configs) {
    const ends = spots(name), wrong = typeof ends === "string" ? ends : ends.length === 2 ? geometry(ends[0], ends[1], label) : void wants.set(ends[0], label);
    if (wrong) return `config: ${wrong}.`;
    if (ends.length === 2) turned.add(bondOf(ends[0] as number, ends[1] as number));
  }
  // config sets a centre the changes make, or one a change took the configuration of (an epoxide opened): never one
  // that keeps its configuration, which config would turn over with no word.
  for (const [j, label] of wants) {
    const had = was[j] >= 0 ? stereoLabels(from)?.atoms[was[j]] : undefined, now = had && stereoLabels(m)?.atoms[j];
    if (now && now !== label) return `config: ${who(j)} keeps its configuration (${now}) through these changes, and config sets only a new centre: to change ${who(j)}, give the compound as text.`;
  }
  const unsettled = settle(wants);
  if (unsettled) return `config: ${unsettled}.`;
  // A wedge from a centre to an atom that is a centre too is not clear: it could set either. One that the changes
  // made so (the atom at its wide end became a centre, or the compound was laid out again) goes on another bond of
  // its own centre, when one gives the same label.
  {
    const labels = stereoLabels(m)?.atoms ?? [], centres = stereoFacts(m).centres;
    let before: Set<number> | undefined;
    for (const [k, b] of [...m.bonds.entries()]) {
      const [i, j] = b.atoms, had = m;
      if (!(b.stereo === 1 || b.stereo === 6) || !labels[i] || !centres.has(j) || (!relaid && was[j] >= 0 && (before ??= stereoFacts(from).centres).has(was[j]))) continue;
      m = { ...m, bonds: m.bonds.map((x, n) => (n === k ? { ...x, stereo: undefined } : x)) };
      if (settle(new Map([[i, labels[i]!]])) || m.bonds[k].stereo) m = had;
    }
  }
  // Stereo, by CIP label before and after. A centre that is still one keeps its wedges, so its configuration: its
  // label can change with its groups' priorities, which the reply says of a centre a change was made at. One that is
  // no longer a centre loses its wedges (when no other centre reads them). A new double bond that is drawn E or Z
  // has two readings, which a change cannot tell apart; one to a label is drawn neither way, and when it can be E or
  // Z (each end has one other group, or two that differ, with labels read as their atoms) the reply says so.
  const then = stereoLabels(from), facts = stereoFacts(m), gone = new Set<number>();
  let now = stereoLabels(m), unsetThen: Set<number> | undefined; // the centres of `from` with no configuration: read when one is found now
  for (let j = 0; j < m.atoms.length; j++) {
    const label = now?.atoms[j], old = was[j] >= 0 ? then?.atoms[was[j]] : undefined, name = who(j).replace(/^a/, "A");
    if (wants.has(j)) continue; // as config says
    if (old && !label) {
      if (facts.centres.has(j)) return `Octet cannot keep the configuration of ${who(j)} through these changes: give the compound as text.`;
      gone.add(j);
      notes.push(`${name} is no longer a stereocentre.`);
    } else if (old && hit[j]) notes.push(label === old ? `${name} keeps its configuration (${label}).` : `${name} keeps its configuration: its label is now ${label} (was ${old}), as the priorities of its groups changed.`);
    else if (!old && label) notes.push(`${name} is now a stereocentre (${label}, as it is drawn).`);
    else if (!label && facts.unset.has(j) && !(was[j] >= 0 && (unsetThen ??= stereoFacts(from).unset).has(was[j]))) notes.push(`${name} is now a stereocentre with no configuration: to set one, give ${m.atoms[j].tag ? `config ({'${m.atoms[j].tag}': 'R'})` : "the compound as text"}.`);
  }
  if (gone.size) {
    const plain = { ...m, bonds: m.bonds.map((b) => (b.stereo && gone.has(b.atoms[0]) ? { ...b, stereo: undefined } : b)) }, labels = stereoLabels(plain);
    if (JSON.stringify(labels?.atoms) === JSON.stringify(now?.atoms)) [m, now] = [plain, labels];
  }
  for (const [k, b] of m.bonds.entries()) {
    const [p, q] = [was[b.atoms[0]], was[b.atoms[1]]];
    if (b.type !== 2 || !doubled.some(([x, y]) => (x === p && y === q) || (x === q && y === p))) continue;
    if (now?.bonds[k] && !turned.has(k)) return `The new double bond between ${who(b.atoms[0])} and ${who(b.atoms[1])} can be E or Z: ${b.atoms.every((i) => m.atoms[i].tag) ? `say which with config ({'${m.atoms[b.atoms[0]].tag}-${m.atoms[b.atoms[1]].tag}': 'E'} or 'Z')` : "give the compound as text"}.`;
    const [on, group] = m.atoms[b.atoms[0]].text ? [b.atoms[1], b.atoms[0]] : b.atoms, text = m.atoms[group].text;
    if (!text || labelKey(text).atoms < 2) continue; // =O, =CH2: one atom, so no E or Z
    const { mol: x, from: of } = expandWithOrigins(m), near = bondedTo(x), cls = classes(x), i = of.indexOf(on), j = near[i].find((n) => of[n] === group);
    if (j !== undefined && [[i, j], [j, i]].every(([e, o]) => { const rest = near[e].filter((n) => n !== o).map((n) => cls[n]); return rest.length === 1 || (rest.length === 2 && rest[0] !== rest[1]); }))
      notes.push(`The new double bond from ${who(on)} to ${text} is drawn with no E or Z: to set one, give the compound as text.`);
  }
  return { mol: m, notes };
}
