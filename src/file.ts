// Octet's own file format: versioned, human-readable JSON. Treat every file as hostile: check it fully on read.
import { readStyle } from "./docstyle.ts";
import { ALL_ARROW_KINDS, ORBITAL_SHAPES, PHASES, SHAPE_KINDS, type Arrow, type ArrowKind, type LineStyle, type OrbitalShape, type Phase, type Shape, type ShapeKind, type Curve, type Table, type Tlc, type Atom, type Bond, type Caption, type Display, type Mol } from "./render.ts";

export const FORMAT = "octet";
export const VERSION = 1;
const MAX_ATOMS = 100_000;
const DISPLAYS: Display[] = ["bold", "dashed", "hashed", "wavy", "dative", "hollow"];
const MAX_CAPTIONS = 10_000, MAX_TEXT = 2_000;

export function serialize(mol: Mol): string {
  const atoms = mol.atoms.map((a) => ({ label: a.label, x: round(a.location[0]), y: round(a.location[1]), ...(a.charge ? { charge: a.charge } : {}), ...(a.text ? { text: a.text } : {}),
    ...(a.radical ? { radical: a.radical } : {}), ...(a.pairs ? { pairs: a.pairs } : {}), ...(a.circled ? { circled: true } : {}), ...(a.partial ? { partial: a.partial } : {}),
    ...(a.hmark ? { hmark: a.hmark } : {}), ...(a.attach ? { attach: true } : {}), ...(a.bead ? { bead: true } : {}), ...(a.map ? { map: a.map } : {}), ...(a.enhanced ? { enhanced: a.enhanced } : {}), ...(a.colour ? { colour: a.colour } : {}) }));
  const bonds = mol.bonds.map((b) => ({ atoms: b.atoms, type: b.type, ...(b.stereo ? { stereo: b.stereo } : {}), ...(b.display ? { display: b.display } : {}), ...(b.position ? { position: b.position } : {}), ...(b.colour ? { colour: b.colour } : {}) }));
  // Arrows and captions are saved in id order; ids are not saved. Conditions name their arrow by its place in the list.
  const arrowList = [...(mol.arrows ?? [])].sort((a, b) => a.id - b.id);
  const cycleList = [...(mol.cycles ?? [])].sort((a, b) => a.id - b.id);
  const cycles = cycleList.map((c) => ({ x: round(c.centre[0]), y: round(c.centre[1]), radius: round(c.radius), ...(c.clockwise ? {} : { anticlockwise: true }), nodes: c.nodes, ...(c.colour ? { colour: c.colour } : {}) }));
  const arrows = arrowList.map((a) => ({ kind: a.kind, x1: round(a.from[0]), y1: round(a.from[1]), x2: round(a.to[0]), y2: round(a.to[1]), ...(a.bend ? { bend: round(a.bend) } : {}),
    ...(a.style ? { style: a.style } : {}), ...(a.orbital ? { orbital: a.orbital } : {}), ...(a.colour ? { colour: a.colour } : {}) }));
  // Shapes keep their order, which is the order they are drawn in.
  const shapes = (mol.shapes ?? []).map((x) => ({ kind: x.kind, x1: round(x.from[0]), y1: round(x.from[1]), x2: round(x.to[0]), y2: round(x.to[1]), ...(x.dashed ? { dashed: true } : {}), ...(x.colour ? { colour: x.colour } : {}),
    ...(x.fill ? { fill: x.fill } : {}), ...(x.shadow ? { shadow: true } : {}), ...(x.side ? { side: x.side } : {}), ...(x.mark ? { mark: x.mark } : {}), ...(x.tlc ? { tlc: x.tlc } : {}), ...(x.table ? { table: x.table } : {}), ...(x.curve ? { curve: x.curve } : {}) }));
  const captions = [...(mol.captions ?? [])].sort((a, b) => a.id - b.id).map((c) => ({
    text: c.text, x: round(c.x), y: round(c.y), ...(c.bold ? { bold: true } : {}), ...(c.italic ? { italic: true } : {}), ...(c.underline ? { underline: true } : {}),
    ...(c.size ? { size: c.size } : {}), ...(c.align ? { align: c.align } : {}), ...(c.under ? { under: c.under } : {}), ...(c.colour ? { colour: c.colour } : {}),
    ...(c.on ? { on: { arrow: arrowList.findIndex((a) => a.id === c.on!.arrow), side: c.on.side } } : {}),
    ...(c.cycle ? { cycle: { cycle: cycleList.findIndex((x) => x.id === c.cycle!.cycle), step: c.cycle.step, side: c.cycle.side } } : {}),
  }));
  return JSON.stringify({ format: FORMAT, version: VERSION, structure: { atoms, bonds }, ...(arrows.length ? { arrows } : {}), ...(cycles.length ? { cycles } : {}), ...(shapes.length ? { shapes } : {}), ...(captions.length ? { captions } : {}), ...(mol.style ? { style: mol.style } : {}) }, null, 1) + "\n";
}
const round = (n: number) => Math.round(n * 1e4) / 1e4;
// A pen curve's points, if they are sound: 2 to 1000 anchors, each with optional handles.
function readCurve(v: unknown): Curve | undefined {
  const c = v as { points?: unknown; closed?: unknown };
  const pt = (q: unknown) => Array.isArray(q) && q.length === 2 && q.every((n) => typeof n === "number" && Number.isFinite(n) && Math.abs(n) < 1e6);
  if (typeof c !== "object" || !c || !Array.isArray(c.points) || c.points.length < 2 || c.points.length > 1000) return undefined;
  const points = c.points as { at?: unknown; c1?: unknown; c2?: unknown }[];
  if (!points.every((p) => typeof p === "object" && p && pt(p.at) && (p.c1 === undefined || pt(p.c1)) && (p.c2 === undefined || pt(p.c2)))) return undefined;
  return { points: points.map((p) => ({ at: p.at as [number, number], ...(p.c1 ? { c1: p.c1 as [number, number] } : {}), ...(p.c2 ? { c2: p.c2 as [number, number] } : {}) })), ...(c.closed === true ? { closed: true } : {}) };
}
// A table's cells, if they are sound: up to 100 rows and 20 columns of short plain text.
function readTable(v: unknown): Table | undefined {
  const t = v as { cells?: unknown; grid?: unknown };
  if (typeof t !== "object" || !t || !Array.isArray(t.cells) || !t.cells.length || t.cells.length > 100) return undefined;
  const cells = t.cells as unknown[];
  if (!cells.every((r) => Array.isArray(r) && r.length >= 1 && r.length <= 20 && r.every((c) => typeof c === "string" && c.length <= 500 && !/[\u0000-\u0009\u000b-\u001f]/.test(c)))) return undefined;
  return { cells: cells as string[][], ...(t.grid === true ? { grid: true } : {}) };
}
// A TLC plate's lanes and spots, if they are sound.
function readTlc(v: unknown): Tlc | undefined {
  const t = v as { lanes?: unknown; spots?: unknown; rf?: unknown };
  if (typeof t !== "object" || !t || !Number.isInteger(t.lanes) || (t.lanes as number) < 1 || (t.lanes as number) > 40 || !Array.isArray(t.spots) || t.spots.length > 400) return undefined;
  const spots = (t.spots as { lane?: unknown; rf?: unknown }[]).filter((x) => Number.isInteger(x?.lane) && (x.lane as number) >= 0 && (x.lane as number) < (t.lanes as number) && typeof x.rf === "number" && x.rf >= 0 && x.rf <= 1);
  if (spots.length !== t.spots.length) return undefined;
  return { lanes: t.lanes as number, spots: spots.map((x) => ({ lane: x.lane as number, rf: x.rf as number })), ...(t.rf === true ? { rf: true } : {}) };
}

// Throws an Error with a message for the user if the file is not a drawing this version can read.
export function parse(text: string): Mol {
  let data: unknown;
  try { data = JSON.parse(text); } catch { throw new Error("This file is not an Octet drawing."); }
  const d = data as { format?: unknown; version?: unknown; structure?: { atoms?: unknown; bonds?: unknown }; captions?: unknown; arrows?: unknown; style?: unknown; cycles?: unknown; shapes?: unknown };
  if (d?.format !== FORMAT) throw new Error("This file is not an Octet drawing.");
  if (typeof d.version !== "number" || d.version > VERSION) throw new Error("This drawing comes from a newer version of Octet. Update Octet to open it.");
  const atoms = d.structure?.atoms, bonds = d.structure?.bonds;
  if (!Array.isArray(atoms) || !Array.isArray(bonds) || atoms.length > MAX_ATOMS || bonds.length > MAX_ATOMS * 4) throw new Error("This drawing is damaged.");
  const num = (v: unknown) => typeof v === "number" && Number.isFinite(v) && Math.abs(v) < 1e6;
  const badColour = (v: unknown) => v !== undefined && !(typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v));
  const int = (v: unknown, lo: number, hi: number) => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;
  const out: Mol = { atoms: [], bonds: [] };
  for (const a of atoms as Record<string, unknown>[]) {
    if (typeof a?.label !== "string" || !/^[A-Z][a-z]{0,2}$/.test(a.label) || !num(a.x) || !num(a.y) || (a.charge !== undefined && !int(a.charge, -9, 9)) || (a.text !== undefined && (typeof a.text !== "string" || a.text.length > 40 || /[\u0000-\u001f<>]/.test(a.text)))
      || (a.radical !== undefined && !int(a.radical, 0, 2)) || (a.pairs !== undefined && !int(a.pairs, 0, 4)) || (a.circled !== undefined && typeof a.circled !== "boolean")
      || (a.partial !== undefined && a.partial !== "+" && a.partial !== "-") || (a.hmark !== undefined && a.hmark !== "dot" && a.hmark !== "dash")
      || (a.attach !== undefined && typeof a.attach !== "boolean") || (a.bead !== undefined && typeof a.bead !== "boolean") || (a.map !== undefined && !int(a.map, 1, 9999))
      || (a.enhanced !== undefined && !(typeof a.enhanced === "string" && /^(abs|&[1-9]\d?|or[1-9]\d?)$/.test(a.enhanced))) || badColour(a.colour)) throw new Error("This drawing is damaged.");
    const atom: Atom = { label: a.label, location: [a.x as number, a.y as number, 0] };
    if (a.charge) atom.charge = a.charge as number;
    if (a.text) atom.text = a.text as string;
    if (a.radical) atom.radical = a.radical as number;
    if (a.pairs) atom.pairs = a.pairs as number;
    if (a.circled) atom.circled = true;
    if (a.partial) atom.partial = a.partial as "+" | "-";
    if (a.hmark) atom.hmark = a.hmark as "dot" | "dash";
    if (a.attach) atom.attach = true;
    if (a.bead) atom.bead = true;
    if (a.map) atom.map = a.map as number;
    if (a.enhanced) atom.enhanced = a.enhanced as string;
    if (a.colour) atom.colour = a.colour as string;
    out.atoms.push(atom);
  }
  for (const b of bonds as Record<string, unknown>[]) {
    const ends = b?.atoms as unknown[];
    if (!Array.isArray(ends) || ends.length !== 2 || !ends.every((i) => int(i, 0, out.atoms.length - 1)) || ends[0] === ends[1] || !int(b.type, 1, 3) || (b.stereo !== undefined && b.stereo !== 1 && b.stereo !== 6) || (b.display !== undefined && !DISPLAYS.includes(b.display as Display)) || (b.position !== undefined && !["left", "centre", "right"].includes(b.position as string)) || badColour(b.colour)) throw new Error("This drawing is damaged.");
    const bond: Bond = { type: b.type as number, atoms: [ends[0] as number, ends[1] as number] };
    if (b.stereo) bond.stereo = b.stereo as number;
    if (b.display) bond.display = b.display as Display;
    if (b.position) bond.position = b.position as Bond["position"];
    if (b.colour) bond.colour = b.colour as string;
    out.bonds.push(bond);
  }
  if (d.style !== undefined) out.style = readStyle(d.style);
  // Arrows take ids after the captions'.
  const captionCount = Array.isArray(d.captions) ? d.captions.length : 0;
  if (d.arrows !== undefined) {
    if (!Array.isArray(d.arrows) || d.arrows.length > MAX_CAPTIONS) throw new Error("This drawing is damaged.");
    out.arrows = (d.arrows as Record<string, unknown>[]).map((a, k): Arrow => {
      const orb = a?.orbital as { shape?: unknown; phase?: unknown } | undefined;
      if (!ALL_ARROW_KINDS.includes(a?.kind as ArrowKind) || ![a.x1, a.y1, a.x2, a.y2].every(num) || (a.bend !== undefined && !(num(a.bend) && Math.abs(a.bend as number) <= 5))
        || (a.style !== undefined && a.style !== "dashed" && a.style !== "bold" && a.style !== "wavy")
        || (orb !== undefined && (!ORBITAL_SHAPES.includes(orb?.shape as OrbitalShape) || !PHASES.includes(orb?.phase as Phase))) || ((a.kind === "orbital") !== (orb !== undefined)) || badColour(a.colour)) throw new Error("This drawing is damaged.");
      return { id: captionCount + k + 1, kind: a.kind as ArrowKind, from: [a.x1 as number, a.y1 as number], to: [a.x2 as number, a.y2 as number], ...(a.bend ? { bend: a.bend as number } : {}),
        ...(a.style ? { style: a.style as LineStyle } : {}), ...(orb ? { orbital: { shape: orb.shape as OrbitalShape, phase: orb.phase as Phase } } : {}), ...(a.colour ? { colour: a.colour as string } : {}) };
    });
  }
  // Cycles take ids after the arrows'.
  if (d.cycles !== undefined) {
    if (!Array.isArray(d.cycles) || d.cycles.length > MAX_CAPTIONS) throw new Error("This drawing is damaged.");
    out.cycles = (d.cycles as Record<string, unknown>[]).map((c, k) => {
      const nodes = c?.nodes as unknown[];
      if (!num(c?.x) || !num(c.y) || !num(c.radius) || (c.radius as number) <= 0 || !Array.isArray(nodes) || nodes.length < 2 || nodes.length > 64
        || !nodes.every((n) => Array.isArray(n) && n.length > 0 && n.every((i) => int(i, 0, out.atoms.length - 1))) || badColour(c.colour)) throw new Error("This drawing is damaged.");
      return { id: captionCount + (out.arrows?.length ?? 0) + k + 1, centre: [c.x as number, c.y as number], radius: c.radius as number, clockwise: c.anticlockwise !== true, nodes: nodes as number[][], ...(c.colour ? { colour: c.colour as string } : {}) };
    });
  }
  // Shapes take ids after the cycles'.
  if (d.shapes !== undefined) {
    if (!Array.isArray(d.shapes) || d.shapes.length > MAX_CAPTIONS) throw new Error("This drawing is damaged.");
    const first = captionCount + (out.arrows?.length ?? 0) + (out.cycles?.length ?? 0) + 1;
    out.shapes = (d.shapes as Record<string, unknown>[]).map((x, k): Shape => {
      if (!SHAPE_KINDS.includes(x?.kind as ShapeKind) || ![x.x1, x.y1, x.x2, x.y2].every(num) || (x.dashed !== undefined && typeof x.dashed !== "boolean")
        || (x.colour !== undefined && !(typeof x.colour === "string" && /^#[0-9a-f]{6}$/i.test(x.colour)))
        || (x.fill !== undefined && x.fill !== "shaded" && x.fill !== "solid") || (x.shadow !== undefined && typeof x.shadow !== "boolean")
        || (x.side !== undefined && x.side !== "left" && x.side !== "right") || (x.mark !== undefined && !(typeof x.mark === "string" && x.mark.length <= 8))
        || (x.tlc !== undefined && !readTlc(x.tlc)) || (x.table !== undefined && !readTable(x.table)) || (x.curve !== undefined && !readCurve(x.curve))) throw new Error("This drawing is damaged.");
      return { id: first + k, kind: x.kind as ShapeKind, from: [x.x1 as number, x.y1 as number], to: [x.x2 as number, x.y2 as number], ...(x.dashed ? { dashed: true } : {}), ...(x.colour ? { colour: x.colour as string } : {}),
        ...(x.fill ? { fill: x.fill as "shaded" | "solid" } : {}), ...(x.shadow ? { shadow: true } : {}), ...(x.side ? { side: x.side as "left" | "right" } : {}), ...(x.mark ? { mark: x.mark as string } : {}),
        ...(x.tlc ? { tlc: readTlc(x.tlc)! } : {}), ...(x.table ? { table: readTable(x.table)! } : {}), ...(x.curve ? { curve: readCurve(x.curve)! } : {}) };
    });
  }
  if (d.captions === undefined) return out;
  if (!Array.isArray(d.captions) || d.captions.length > MAX_CAPTIONS) throw new Error("This drawing is damaged.");
  out.captions = (d.captions as Record<string, unknown>[]).map((c, k) => {
    const under = c?.under as unknown[] | undefined, on = c?.on as { arrow?: unknown; side?: unknown } | undefined;
    const cyc = c?.cycle as { cycle?: unknown; step?: unknown; side?: unknown } | undefined;
    if (typeof c?.text !== "string" || c.text.length > MAX_TEXT || /[\u0000-\u0009\u000b-\u001f]/.test(c.text) || !num(c.x) || !num(c.y)
      || (c.bold !== undefined && typeof c.bold !== "boolean") || (c.italic !== undefined && typeof c.italic !== "boolean") || (c.underline !== undefined && typeof c.underline !== "boolean")
      || (c.size !== undefined && !(num(c.size) && (c.size as number) >= 4 && (c.size as number) <= 144))
      || (c.align !== undefined && !["left", "centre", "right"].includes(c.align as string))
      || (c.colour !== undefined && !(typeof c.colour === "string" && /^#[0-9a-f]{6}$/i.test(c.colour)))
      || (under !== undefined && (!Array.isArray(under) || !under.length || under.length > out.atoms.length || !under.every((i) => int(i, 0, out.atoms.length - 1))))
      || (on !== undefined && (!int(on?.arrow, 0, (out.arrows?.length ?? 0) - 1) || (on.side !== "above" && on.side !== "below")))
      || (cyc !== undefined && (!int(cyc?.cycle, 0, (out.cycles?.length ?? 0) - 1) || !int(cyc.step, 0, 63) || !["in", "out", "centre"].includes(cyc.side as string)))) throw new Error("This drawing is damaged.");
    const caption: Caption = { id: k + 1, text: c.text, x: c.x as number, y: c.y as number };
    if (c.bold) caption.bold = true;
    if (c.italic) caption.italic = true;
    if (c.underline) caption.underline = true;
    if (c.size !== undefined) caption.size = c.size as number;
    if (c.align) caption.align = c.align as Caption["align"];
    if (c.colour) caption.colour = c.colour as string;
    if (under) caption.under = under as number[];
    if (on) caption.on = { arrow: out.arrows![on.arrow as number].id, side: on.side as "above" | "below" };
    if (cyc) caption.cycle = { cycle: out.cycles![cyc.cycle as number].id, step: cyc.step as number, side: cyc.side as "in" | "out" | "centre" };
    return caption;
  });
  return out;
}
