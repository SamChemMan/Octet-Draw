// Octet with no window: the AI apps' tools (src/mcp.ts, decision 0021) on drawings kept in memory, in Node. Each
// drawing's Host does what the editor's does (src/Editor.tsx): Name to Structure, Clean Up Structure, Clean Up
// Reaction and tidying a cycle with the editor's own code, and the drawing measured as the window draws it (render,
// fitArrows and placeCaptions, with text measured as browser.ts measures it). There is no picture (a PNG needs a
// renderer: resvg is MPL-2.0, which Sam has not approved), no other windows and no dialogs: export, save and print
// answer that Octet cannot. A read with format gives the drawing's text (CDXML, MOL, SDF, RXN, SMILES, InChI, CDX) as Export
// writes it.
import "./browser.ts";
import { readFileSync } from "node:fs";
import { analyse, analyseCompound, smilesWeight, cipOf, cleanUp, expandLabels, mapReaction, measurer, parseStructure, ready as indigoReady, stereoFacts, STYLE, textExtent, textWidth, toInchi, toInchiAux, toInchiKey, toMolfile, toReaction, toSdf, toSmiles, chiralFlagOnly, type RxnStep } from "../../src/chem.ts";
import { onCaptions, problems, showWarnedHydrogens, WARNING_TYPES } from "../../src/check.ts";
import { toBase64, xmlToCdx } from "../../src/cdx.ts";
import { fromCdxml, parseXml, toCdxml } from "../../src/cdxml.ts";
import { complexName } from "../../src/complexes.ts";
import { dropOnCycle, followArcs, isSide, layoutCycles, spreadCycle, textOn, type Cycle } from "../../src/cycle.ts";
import { loadDictionary, nameList } from "../../src/dictionary.ts";
import { DEFAULT_STYLE, fontStack, frameStyle, pageSize, purposeOf, readStyle, styleFor, type DocStyle } from "../../src/docstyle.ts";
import { DRUGS } from "../../src/drugs.ts";
import { carryDepth, EMPTY, fitSizes, fragments, inRow, moveAtoms, pickAtoms, placeCentres, sandwich, scaleSizes, updateCaption, wholeGroups, withCaptionAtoms } from "../../src/edit.ts";
import { experimentPage, newExperiment, newGrids } from "../../src/experiment.ts";
import { interpret, type Part } from "../../src/interpret.ts";
import { formulaRuns, labelSmiles } from "../../src/labels.ts";
import { resetIds, type FileFormat, type From, type Host } from "../../src/mcp.ts";
import { iupacName } from "../../src/namer.ts";
import { attachOpsin, knownName, looksLikeSmiles, nameToAtoms, nameToSmiles } from "../../src/names.ts";
import { checkedName, setComplexNamer, setNamer } from "../../src/naming.ts";
import { onTop } from "../../src/order.ts";
import { cleanUpReactions, findReaction, gapFor, withStructure, type Layout, type Reaction } from "../../src/reaction.ts";
import { ASCENT, DESCENT, fitArrows, placeCaptions, render, straightArrow, type Box, type Caption, type Mol } from "../../src/render.ts";
import { reagentFormula } from "../../src/stoich.ts";
import { gridViews } from "../../src/gridview.ts";
import { lines as richLines, type RunStyle } from "../../src/richtext.ts";

setNamer(iupacName);
setComplexNamer((m) => complexName(m, { read: nameToSmiles, atoms: nameToAtoms, inchi: toInchi, aux: toInchiAux, cip: cipOf }));

// Indigo, then OPSIN (its data pack read as names.ts reads it), Octet's name index, drug names and abbreviations, and
// the names dictionary. Once for each process (or worker).
let loading: Promise<void> | undefined;
export function load(): Promise<void> {
  loading ??= (async () => {
    await indigoReady;
    const dir = new URL("../../src/vendor/opsin/", import.meta.url), pack = readFileSync(new URL("opsin-data.bin", dir)), files = new Map<string, Int8Array>();
    for (let p = 0; ; ) {
      const n = pack.readUInt16BE(p); p += 2;
      if (!n) break;
      const name = pack.toString("latin1", p, p + n); p += n;
      const size = pack.readInt32BE(p); p += 4;
      files.set(name, new Int8Array(pack.buffer, pack.byteOffset + p, size)); p += size;
    }
    (globalThis as { opsinResource?: unknown }).opsinResource = (name: string) => files.get(name) ?? null;
    const opsin = await import(new URL("opsin.js", dir).href);
    opsin.init();
    const json = (f: string) => JSON.parse(readFileSync(new URL(`../../src/${f}`, import.meta.url), "utf8"));
    attachOpsin(opsin, readFileSync(new URL("names.txt", dir), "utf8"), json("nameindex.json"), DRUGS, json("abbreviations.json"));
    await loadDictionary();
  })();
  return loading;
}

const L = STYLE.bond; // px per bond length at 100%, as the editor draws
const union = (boxes: Box[]): Box | undefined => (boxes.length ? [Math.min(...boxes.map((b) => b[0])), Math.min(...boxes.map((b) => b[1])), Math.max(...boxes.map((b) => b[2])), Math.max(...boxes.map((b) => b[3]))] : undefined);
const toDoc = (b: Box): Box => [b[0] / L, -b[3] / L, b[2] / L, -b[1] / L];
const formulaWidth = (text: string, size: number, bold?: boolean, italic?: boolean, family?: string) =>
  formulaRuns(text).reduce((w, r) => w + textWidth(r.text, r.sub ? 0.75 * size : size, bold, italic, family), 0);
const asFormula = (c: Caption) => !!c.cycle && c.cycle.side !== "name";

// A drawing as the window draws it: its structures, arrows fitted to their text, captions placed, cycles laid out.
// Worked out once for each state of a drawing.
type Laid = ReturnType<typeof layOut>;
const laid = new WeakMap<Mol, Laid>();
function layOut(m: Mol) {
  const style = readStyle(m.style ?? DEFAULT_STYLE), frame = frameStyle(style, L), measure = measurer(fontStack(style.labelFont), frame.size), pt = (4 / 3) * frame.k;
  const drawing = render(m, frame, measure, L);
  const width = (t: string, c: Caption, j = 0) => {
    const px = (c.size ?? style.captionSize) * pt;
    if (c.runs) return (richLines(c.runs)[j] ?? []).reduce((w, r) => w + textWidth(r.text, (r.size ? r.size * pt : px) * (r.script ? 0.75 : 1), r.bold ?? c.bold, r.italic ?? c.italic, fontStack(r.font ?? c.font ?? style.captionFont)), 0);
    return (c.on || asFormula(c) ? formulaWidth : textWidth)(t, px, c.bold, c.italic, fontStack(c.font ?? style.captionFont));
  };
  const arrows = fitArrows(m, L, (c) => Math.max(...c.text.split("\n").map((t, j) => width(t, c, j))), pt);
  const face = (c: Caption, r: RunStyle) => [(r.size ? r.size * pt : (c.size ?? style.captionSize) * pt) * (r.script ? 0.75 : 1), r.bold ?? c.bold, r.italic ?? c.italic, fontStack(r.font ?? c.font ?? style.captionFont)] as const;
  const run = (t: string, c: Caption, r: RunStyle) => textWidth(t, ...face(c, r)), extent = (t: string, c: Caption, r: RunStyle) => textExtent(t, ...face(c, r));
  const inkPx = (atoms: number[]) => union(atoms.filter((i) => drawing.ink[i]).map((i) => drawing.ink[i]));
  const nodeText = (m.captions ?? []).filter((c) => c.cycle?.side === "node");
  const texts = nodeText.length ? placeCaptions({ ...m, captions: nodeText }, drawing, width, arrows, pt, style.captionSize, new Map(), run, extent) : [];
  const cycles = layoutCycles(m, L, pt, inkPx, (id) => texts.find((x) => x.id === id)?.box);
  const placed = placeCaptions(m, drawing, width, arrows, pt, style.captionSize, cycles.anchors, run, extent);
  const ink = (atoms: number[]) => { const b = inkPx(atoms); return b && toDoc(b); };
  const captionBox = (id: number) => { const c = placed.find((x) => x.id === id); return c && toDoc(c.box); };
  return { style, frame, measure, pt, drawing, arrows, cycleArrows: cycles.arrows, placed, ink, captionBox, inkPx };
}
const drawn = (m: Mol): Laid => { let d = laid.get(m); if (!d) laid.set(m, (d = layOut(m))); return d; };

const reagent = (text: string) => reagentFormula(text, nameToSmiles, labelSmiles, smilesWeight);

const warnOn = (t: string) => WARNING_TYPES.find((w) => w.id === t)!.on;
const STEREO = (["unspecified", "ambiguous", "enhanced", "between", "backwards"] as const).some(warnOn);

// Each AI app session's brief (set_brief), kept as Octet's window keeps it (src-tauri/src/mcp.rs): a new session has
// none, and two sessions do not share one. What a call from a session gives handle (src/mcp.ts).
const briefs = new Map<string, string>();
export const session = (client: string, id: string): From => ({ client, session: id, brief: briefs.get(id), keep: (b) => void briefs.set(id, b) });

/** A new drawing for a purpose (File > New For: paper, thesis, slides, poster, experiment, quick), as a Host with
 * Undo and Redo. Its ids start again from the first (mcp.ts resetIds), so the same calls give the same drawing. */
export function drawing(purpose = "paper", title = "Untitled") {
  resetIds();
  const fresh = (id: string): Mol => {
    const style = styleFor({ purposeStyles: {}, ownPurposes: [] }, id);
    return { ...EMPTY, style, ...(purposeOf({ ownPurposes: [] }, id)?.kind === "experiment" ? newExperiment(pageSize(style), style.bond, undefined) : {}) };
  };
  let doc = fresh(purpose), past: Mol[] = [], future: Mol[] = [], start: Mol | undefined, undid = false;
  let picked = { atoms: [] as number[], items: [] as number[] };
  const told: string[] = [];
  const style = (): DocStyle => readStyle(doc.style ?? DEFAULT_STYLE);
  const expPage = () => { const s = style(); return experimentPage(purposeOf({ ownPurposes: [] }, s.purpose)?.kind, s.purpose, doc.annotations); };
  // The editor's set: hydrogens shown on warned atoms, multi-centre points placed, depth carried, groups kept whole,
  // what lands on a cycle joined to it, the stacking order kept, and on an experiment page a reagent table for a new
  // reaction.
  const set = (mol: Mol): Mol => {
    const s = style(), dropBox = (c: Caption): Box => {
      if (isSide(c.cycle)) return [c.x, c.y, c.x, c.y];
      const size = (c.size ?? s.captionSize) / s.bond, ls = c.text.split("\n"), w = Math.max(...ls.map((t) => textWidth(t, size, c.bold, c.italic, fontStack(c.font ?? s.captionFont)))), x = c.x - (c.align === "right" ? w : c.align === "centre" ? w / 2 : 0);
      return [x, c.y - (ls.length - 0.75) * 1.2 * size, x + w, c.y + 0.75 * size];
    };
    const fitted = placeCentres(carryDepth(doc, showWarnedHydrogens(mol)));
    const cycled = fitted.cycles?.length ? dropOnCycle(fitted, fragments(fitted), doc, { box: dropBox, bond: s.bond }) : fitted;
    const ordered = onTop(doc, wholeGroups(cycled), fragments);
    doc = expPage() && mol.style === doc.style ? newGrids(doc, ordered) : ordered;
    picked = { atoms: [], items: [] };
    return doc;
  };
  // A structure for a name (a list of names gives each in a row; a metallocene is drawn as a sandwich), else SMILES,
  // InChI or a MOL file, as the editor reads typed text (structureFromText).
  const named = (name: string): Mol | undefined => {
    const smiles = nameToSmiles(name);
    if (!smiles) return undefined;
    try {
      const list = nameList(name, nameToSmiles), m = list?.join(".") === smiles ? inRow(list.map((t) => sandwich(parseStructure(t)))) : sandwich(parseStructure(smiles));
      return m.atoms.length ? m : undefined;
    } catch { return undefined; }
  };
  const structure = (text: string): Mol | undefined => {
    const s = text.trim(), lines = s.includes("\n");
    const found = lines && /V[23]000|M {2}END|\$RXN|\$RDFILE|^[<{]/.test(s) ? undefined : named(s);
    if (found || !(lines || looksLikeSmiles(s))) return found;
    try {
      const m = parseStructure(lines ? text.trimEnd() : s);
      // Stereo flags from an MDL chiral flag only with Settings' Show Stereoflags When Opening MDL Format Files (off).
      return !m.atoms.length ? undefined : chiralFlagOnly(text) ? { ...m, atoms: m.atoms.map((a) => (a.enhanced ? (({ enhanced: _, ...rest }) => rest)(a) : a)) } : m;
    } catch { return undefined; }
  };
  const reactionLayout = (d: Laid): Layout => {
    const s = d.style, size = (s.captionSize * d.pt) / L, w = textWidth("+", s.captionSize * d.pt, false, false, fontStack(s.captionFont)) / L;
    return { gap: gapFor(s.captionSize, s.bond), width: ((pageSize(s)[0] * 72) / 25.4 - 72) / s.bond, captionBox: d.captionBox, plusBox: [-w / 2, -DESCENT * size, w / 2, ASCENT * size], captionPt: s.captionSize, bondPt: s.bond };
  };
  // Clean Up Reaction on the reactions pick takes, measured as drawn now. m: the drawing to lay out (the one drawn
  // now, or that with a structure cleaned up).
  const cleanReactions = (pick: (r: Reaction) => boolean, m = doc) => {
    const d = drawn(doc), inkOf = (mol: Mol) => { const e = drawn(mol); return e.ink; };
    const done = cleanUpReactions(m, d.arrows, inkOf, reactionLayout(d), pick);
    if (done.count) set(done.mol);
    return done.count;
  };
  // Tidy a cycle: breaks go round evenly with the intermediates, and side arrows' structures go with their arcs.
  const spread = (m: Mol, c: Cycle): Mol => {
    if (!c.nodes.some((n, i) => n.length || textOn(m, c, i))) return m;
    const d = drawn(m), ink = (atoms: number[], i: number) => { const t = atoms.length ? undefined : textOn(m, c, i); return t ? d.placed.find((x) => x.id === t.id)?.box : d.inkPx(atoms); };
    const { shifts, radius } = spreadCycle(c, L, ink), even = c.nodes.map((_, i) => Math.PI / 2 - ((c.clockwise ? 1 : -1) * 2 * Math.PI * i) / c.nodes.length);
    let out = followArcs(m, c, even, radius);
    c.nodes.forEach((n, i) => {
      out = moveAtoms(out, new Set(n), shifts[i]);
      const t = n.length ? undefined : textOn(out, c, i);
      if (t) out = updateCaption(out, t.id, { x: t.x + shifts[i][0], y: t.y + shifts[i][1] });
    });
    return { ...out, cycles: out.cycles?.map((x) => (x.id === c.id ? { ...x, radius, at: even } : x)) };
  };
  // Each reagent table as the editor lays it out (gridview.ts), as the editor's Host gives it.
  const tables = () => {
    const m = doc, d = drawn(m), s = style();
    return gridViews(m, {
      reaction: (id) => findReaction(m, id, d.arrows, d.ink, d.captionBox), steps: (r) => interpret(m, r, d.captionBox),
      structure: (atoms) => analyseCompound(pickAtoms(m, atoms)), reagent,
      bottom: (id) => d.captionBox(id)?.[1],
      nameWidth: (t, size, bold = false) => formulaWidth(t, size * d.pt, bold, false, fontStack(s.captionFont)) / L,
      captionSize: s.captionSize, perPt: d.pt / L, experiment: expPage(),
    }).map((v) => {
      const right = Math.max(...v.cols.map((c) => c.x)) + v.width / 2;
      return { arrow: v.arrow, box: [v.start, v.top - v.rows.length * v.rh, right, v.top] as Box, columns: v.cols.map((c) => ({ key: c.key, what: c.what, formula: c.formula, mw: c.mw, product: c.product, typed: c.typed as Record<string, number>, worked: v.solved[c.key] as Record<string, unknown> | undefined })) };
    });
  };
  // The reaction steps in a drawing or a part of it, for RXN files and reaction SMILES (the editor's stepsIn): each
  // step's reactant, product and agent structures. A step needs a reactant and a product structure.
  const stepsOf = (m: Mol): RxnStep[] => {
    const d = drawn(m), seen = new Set<number>(), out: RxnStep[] = [], atoms = (list: Part[]) => list.flatMap((x) => (x.kind === "structure" ? [x.atoms] : []));
    for (const a of d.arrows) {
      if (seen.has(a.id) || !straightArrow(a)) continue;
      const r = findReaction(m, a.id, d.arrows, d.ink, d.captionBox);
      if (!r) continue;
      r.arrows.forEach((id) => seen.add(id));
      for (const st of interpret(m, r, d.captionBox)) out.push({ reactants: atoms(st.reactants), products: atoms(st.products), agents: atoms([...st.above, ...st.below]) });
    }
    return out.filter((st) => st.reactants.length && st.products.length);
  };
  // A file's text as Export writes it (the editor's formatOf), for the drawing or a part of it. Nothing is saved.
  const fileText = (format: FileFormat, part?: Mol): string | undefined => {
    const m = part ?? doc, cdxml = () => toCdxml(m, style(), {
      derived: drawn(m).cycleArrows, name: title,
      expand: (text) => { const smiles = labelSmiles(text); try { return smiles ? parseStructure(smiles) : undefined; } catch { return undefined; } },
    });
    try {
      if (format === "cdxml") return cdxml();
      if (format === "cdx") return toBase64(xmlToCdx(parseXml(cdxml())));
      const chem = withCaptionAtoms(m, style().interpret).mol;
      if (!chem.atoms.length) return undefined;
      if (format === "inchi") return toInchi(chem) || undefined;
      if (format === "mol" || format === "mol2000") return toMolfile(chem, format === "mol2000");
      if (format === "sdf") return toSdf(chem);
      const steps = stepsOf(m);
      if (format === "smiles") return steps.length ? toReaction(chem, steps, "smiles") : toSmiles(chem);
      // (No pictures and no .oct here: a picture needs the app's renderer.)
      return format === "rxn" && steps.length === 1 ? toReaction(chem, steps, "rxn") : undefined;
    } catch { return undefined; }
  };
  const selected = () => (picked.atoms.length || picked.items.length ? picked : undefined);
  const COMMANDS: Record<string, () => boolean> = {
    undo: () => { const was = past.pop(); if (!was) return false; future.push(doc); doc = was; undid = true; return true; },
    redo: () => { const next = future.pop(); if (!next) return false; past.push(doc); doc = next; undid = true; return true; },
    select_all: () => { picked = { atoms: doc.atoms.map((_, i) => i), items: [...(doc.captions ?? []), ...(doc.arrows ?? []), ...(doc.shapes ?? []), ...(doc.cycles ?? [])].map((x) => x.id) }; return true; },
    // As the editor's clean_up: the structures, then each reaction they are in laid out again, measured after the
    // clean-up, so they keep their sides.
    clean_up: () => {
      const s = selected(), ids = s && new Set(s.atoms), m = cleanUp(doc, ids);
      const touched = new Set(ids ? fragments(m).filter((g) => g.some((i) => ids.has(i))).flat() : m.atoms.map((_, i) => i));
      if (!cleanReactions((r) => withStructure(r) && r.atoms.some((i) => touched.has(i)), m)) set(m);
      return true;
    },
    clean_reaction: () => { const s = selected(); cleanReactions((r) => !s || r.arrows.some((id) => s.items.includes(id)) || r.atoms.some((i) => s.atoms.includes(i))); return true; },
    zoom_fit: () => true, show_page: () => true, check_structure: () => true, show_warnings: () => true,
    ...Object.fromEntries(["paper", "thesis", "slides", "poster", "experiment", "quick"].map((p) => [`new_${p}`, () => { set(fresh(p)); return true; }])),
  };
  const host: Host = {
    doc: () => doc, style, ready: load,
    structure, named: (text) => { try { return !!nameToSmiles(text); } catch { return false; } },
    tidy: (m) => { try { return cleanUp(m); } catch { return m; } },
    begin: () => { start = doc; undid = false; },
    end: () => { if (start && doc !== start && !undid) { past.push(start); future = []; } start = undefined; },
    set, settle: async () => {},
    cleanReactions: (ids) => cleanReactions((r) => r.arrows.some((id) => ids.has(id))),
    tidyCycle: (id) => { const c = doc.cycles?.find((x) => x.id === id); if (c) set(spread(doc, c)); },
    command: (id) => COMMANDS[id]?.() ?? false,
    act: (id) => COMMANDS[id]?.() ?? false, // the Actions panel's actions need the editor: a menu command here, else nothing
    map: (reactants, products) => mapReaction(reactants, products),
    newWindow: () => false,
    reaction: (id) => { const d = drawn(doc); return findReaction(doc, id, d.arrows, d.ink, d.captionBox); },
    ink: (atoms) => drawn(doc).ink(atoms), textBox: (id) => drawn(doc).captionBox(id),
    labelBox: (i) => { const b = drawn(doc).drawing.label[i]; return b && toDoc(b); },
    reagent, tables, fileText,
    inchi: (m) => { try { const e = expandLabels(m); return { inchi: toInchi(e), key: toInchiKey(e) }; } catch { return {}; } },
    problems: () => {
      const chem = withCaptionAtoms(doc, style().interpret);
      let stereo;
      try { stereo = STEREO ? stereoFacts(doc, warnOn("enhanced")) : undefined; } catch { stereo = undefined; }
      return onCaptions(problems(chem.mol, stereo, true), doc.atoms.length, chem.captions).filter((p) => warnOn(p.type));
    },
    smiles: (m) => { try { return toSmiles(expandLabels(m)); } catch { return undefined; } },
    formula: (m) => { try { return analyseCompound(m)?.formula; } catch { return undefined; } },
    name: (m) => { try { const e = expandLabels(m), inchi = (s: Mol | string) => { try { return toInchi(typeof s === "string" ? parseStructure(s, false) : s); } catch { return undefined; } }; return checkedName(m, e, nameToSmiles, inchi, cipOf, knownName); } catch { return undefined; } },
    picture: async () => undefined,
    centre: () => [0, 0], // a new drawing opens with the page's middle in the window's middle
    restyle: (next) => { set({ ...scaleSizes(doc, next.scale / style().scale), style: next }); },
    experiment: expPage,
    said: (text) => { told.push(text); },
    // No window shows that an AI app is drawing.
    working: () => {},
    selection: () => picked,
    select: (atoms, items) => { picked = { atoms, items }; },
    file: (text) => {
      if (/<CDXML[\s>/]/.test(text.slice(0, 65536))) { const read = fromCdxml(text); return read.style ? fitSizes(read.mol, read.style, style()) : read.mol; }
      return structure(text);
    },
    export: () => false,
    // (No command here opens a dialog: the stand-in for the editor has none.)
    dialog: () => false, windowless: () => false, asking: () => false, dismiss: () => {},
    // (No windows here: drawings new with a file's text opens none, whatever the file.)
    opens: async () => ({}),
    window: () => ({ id: "headless", name: title }),
    windows: async () => [],
    target: async (_session, id) => id === "headless",
  };
  return { host, told };
}
