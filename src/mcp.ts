// AI apps (decision 0021): the MCP server's tools. An AI app the user runs (Claude Desktop, Claude Code and others)
// calls them to draw in the open drawing with Octet's own commands, and to read the drawing back. The transport is
// the app's (src-tauri/src/mcp.rs); this file is the protocol and the tools, with no desktop calls, so the planned web
// component can serve the same tools. Everything the AI app sends is hostile input: each tool's arguments are checked
// against its schema (types, lengths, counts, ranges) before anything runs, text never reaches eval or innerHTML,
// and no tool reads or writes a file (Export and Save As open Octet's own dialogs, where the user chooses).
// Each tool that changes the drawing is one undo step (Edit > Undo takes all of it away), and its result says what
// it drew.
import { addTemplate, insertMol, addArrow, addCaption, addCycle, fragments, extractSelection, deleteGraphics, erase, flipAtoms, rotateAtoms, moveAtoms, keepIdsAbove, startIds, setLabel, setEnhanced, setBondSpec, addShape, updateArrow, updateCaption, updateShape, newTable, pickAtoms } from "./edit.ts";
import { change, tagged, TRANSFORMATIONS, type Change } from "./compound.ts";
import { compounds } from "./mixtures.ts";
import { LIBRARY } from "./library.ts";
import { alignByMap, clearScheme, mapScheme } from "./interpret.ts";
import { ORBITAL_SHAPES, PHASES, TABLE_LINES, SHADE, sizedHead, turns, type Shape, type Spot, type Table, type CellAlign, type OrbitalShape, type Phase, type CurveFill, type BracketUsage, type AtomQuery } from "./render.ts";
import { BONDS, type BondKind } from "./kinds.ts";
import { addSide, isSide, type Cycle } from "./cycle.ts";
import { withDetails, detailsOf, FIELDS, type Details } from "./experiment.ts";
import { conditionItems, parseAmount, reagentName, type Field } from "./stoich.ts";
import { COLUMNS, PRESETS, PAGES, QUICK_STYLE, forPurpose, pageSize, presetAt, purposeStyle, readStyle, sameStyle, type DocStyle, type PageName } from "./docstyle.ts";
import { isDrawingText, readOct } from "./oct.ts";
import { ASCENT, straightArrow, curved, type Arrow, type ArrowKind, type Atom, type Box, type Caption, type Head, type HeadShape, type LineStyle, type Mol, type ShapeKind, type StepFacts } from "./render.ts";
import type { Reaction } from "./reaction.ts";
import type { Problem } from "./check.ts";
import type { TextRun } from "./richtext.ts";

type P = [number, number];
// What read with a format gives: every format Export writes (the pictures, from pdf on, as Export makes them).
export const FILE_FORMATS = ["cdxml", "mol", "mol2000", "sdf", "rxn", "smiles", "inchi", "cdx", "oct", "sdf2000", "rxn2000", "rdf", "rdf2000", "pdf", "png", "svg", "emf", "eps", "tif", "jpg", "gif"] as const;
export type FileFormat = (typeof FILE_FORMATS)[number];
// Export's own options for a picture: its resolution, a clear background, and its width in mm.
export type FileOptions = { dpi?: number; transparent?: boolean; width_mm?: number };
// What the editor does for the tools (Editor.tsx makes one each time it draws).
export type Host = {
  doc: () => Mol;
  style: () => DocStyle;
  ready: (names?: boolean) => Promise<void>; // Indigo and the names engine loaded (Indigo alone with names false)
  structure: (text: string) => Mol | undefined; // Name to Structure's reading: a name, SMILES, InChI or MOL file
  tidy: (m: Mol) => Mol; // Clean Up Structure
  named: (text: string) => boolean; // Name to Structure reads the text as a name (not SMILES or a file)
  begin: (label: string) => void; // what follows is one undo step, until end
  end: (made?: Box) => void; // made: the box of what the call made (drawing units, y up), which comes into view
  set: (m: Mol) => Mol; // the drawing as the editor keeps it (an experiment page adds a reagent table to a new arrow)
  settle: () => Promise<void>; // what the tool changed is drawn and measured (3 s at most)
  cleanReactions: (arrows: Set<number>) => number; // Clean Up Reaction on the reactions of these arrows
  tidyCycle: (id: number) => void; // Clean Up on a catalytic cycle (Tidy the cycle)
  command: (id: string) => boolean; // a menu command by its id
  act: (id: string) => boolean; // any menu command or Actions panel action by its id, on the selection (run_command)
  // Map Reaction Atoms for one step (chem.ts mapReaction): each structure's atom numbers, or undefined.
  map: (reactants: Mol[], products: Mol[]) => { reactants: (number | undefined)[][]; products: (number | undefined)[][] } | undefined;
  newWindow: (purpose: string, text?: string) => Promise<string | undefined>; // File > New For, or a file's text opened, always in a new window: its id (none where there are no windows)
  reaction: (arrow: number) => Reaction | undefined;
  ink: (atoms: number[]) => Box | undefined; // drawing units, y up
  textBox: (caption: number) => Box | undefined; // a caption's box as drawn, drawing units, y up
  labelBox: (atom: number) => Box | undefined; // an atom's label as drawn (none for a bare carbon), drawing units, y up
  reagent: (text: string) => { formula: string; weight: number } | undefined; // a reagent's formula, as the reagent table reads it
  fileText: (format: FileFormat, part?: Mol, o?: FileOptions) => string | undefined | Promise<string | undefined>; // the drawing (or a part of it) as the file Export writes: its text, or base64 for a binary one
  inchi: (m: Mol) => { inchi?: string; key?: string }; // a structure's standard InChI and InChIKey
  // Each reagent table as drawn: its reaction's arrow, its columns (key, what, formula, molar mass, typed and worked-out
  // values) and its box.
  tables: () => { arrow: number; columns: { key: string; what: string; formula: string; mw: number; product: boolean; typed: Record<string, number>; worked?: Record<string, unknown> }[]; box: Box }[];
  problems: () => Problem[];
  smiles: (m: Mol) => string | undefined;
  formula: (m: Mol) => string | undefined;
  name: (m: Mol) => string | undefined; // Octet's name for a structure, when it has one
  // The drawing (or this state of it) as a PNG, base64: only `crop` (a box, bond lengths), its long side at most
  // `longest` px (1000 by default).
  picture: (m?: Mol, crop?: Box, longest?: number) => Promise<string | undefined>;
  centre: () => P; // the middle of the view, drawing units
  restyle: (s: DocStyle) => void; // Document settings (one undo step)
  experiment: () => boolean; // the drawing is an experiment page
  said: (text: string) => void; // tells the user what an AI app did, with Undo
  working: (text?: string, stop?: () => void, far?: string) => void; // tells the user an AI app is drawing, with Stop; far: how far the call is ("Step 9 of 17"), no new call; none clears it
  selection: () => { atoms: number[]; items: number[] };
  select: (atoms: number[], items: number[]) => void;
  file: (text: string) => Mol | undefined; // a drawing from CDXML, a MOL, SDF or RXN file, SMILES or InChI
  export: (format: string) => boolean; // Octet's Export dialog, on this format
  dialog: (command: string) => boolean; // the command opens a dialog or a box to type in (run_command says so, or refuses it with no window)
  windowless: () => boolean; // Octet with no window (--headless, --convert): no one is there to finish a dialog
  window: () => { id: string; name: string }; // the drawing (its window) this call acts on
  windows: () => Promise<{ id: string; name: string; edited: boolean }[]>; // Octet's drawings, Home's first
  target: (session: string | undefined, drawing: string) => Promise<boolean>; // the session's calls go to that drawing
};

// ---- Arguments: a small JSON Schema the tools list, and the check every call goes through ----

// An object with additionalProperties true takes any keys: its values are checked later (an operation's arguments,
// against that operation's own schema). anyOf: the first form that fits. $ref: a piece that a schema lists once (its
// $defs) however many places take one: the compound, text that can be runs, and an arrow's end.
type ObjSchema = { type: "object"; properties: Record<string, Schema | Prop>; required?: string[]; additionalProperties?: boolean; description?: string };
type Schema = ObjSchema | { type: "array"; items: Schema | Prop; maxItems: number; minItems?: number; description?: string } | { anyOf: (Schema | Prop)[]; description: string } | { $ref: string };
// The lenient readings (coerce). numeral: a whole number in JSON is read as its text (a compound number); also: other
// names for an enum's values; default: the value a required argument takes when it is left out.
// unlisted: an argument a listed schema leaves out (picture and detail on an operation: the tool that runs it lists
// them).
// quiet: values an enum takes that tools/list leaves out, for room (advanced help names them).
type Prop = { type: "string"; maxLength: number; enum?: readonly string[]; description?: string; numeral?: true; also?: Record<string, string>; default?: string; unlisted?: true; quiet?: readonly string[] } | { type: "number" | "integer"; minimum: number; maximum: number; description?: string; unlisted?: true } | { type: "boolean"; description?: string; unlisted?: true };
const str = (maxLength: number, description?: string): Prop => ({ type: "string", maxLength, ...(description ? { description } : {}) });
// own: what Octet keeps to itself (tools/list leaves it out): the lenient readings, and unlisted.
const pick = (values: readonly string[], description?: string, own?: { also?: Record<string, string>; default?: string; unlisted?: true; quiet?: readonly string[] }): Prop => ({ type: "string", maxLength: 40, enum: values, ...(description ? { description } : {}), ...own });
const numeral = (maxLength: number): Prop => ({ type: "string", maxLength, numeral: true });
const obj = (properties: Record<string, Schema | Prop>, required: string[] = []): ObjSchema => ({ type: "object", properties, required, additionalProperties: false });
const list = (items: Schema | Prop, maxItems: number, minItems = 0): Schema => ({ type: "array", items, maxItems, minItems });
// The pieces by name, a reference to one, and the piece a reference names.
const DEFS: Record<string, Schema> = {};
const define = (name: string, s: Schema): Schema => { DEFS[name] = s; return { $ref: `#/$defs/${name}` }; };
const defined = (s: { $ref: string }) => DEFS[s.$ref.slice("#/$defs/".length)];

export const MAX_TEXT = 300, MAX_STRUCTURE = 20_000, MOST_STRUCTURES = 200;
const RADICALS = ["none", "doublet", "triplet", "singlet"] as const;
// Where the error is, for the AI app to fix its call: "steps[2].above[0]: longer than 300 characters".
function check(s: Schema | Prop, v: unknown, at: string): string | undefined {
  const where = at || "arguments";
  if ("$ref" in s) return check(defined(s), v, at);
  if ("anyOf" in s) {
    if (s.anyOf.some((x) => !check(x, v, at))) return undefined;
    // Text that fits none of the forms: what is wrong with it as text (too long), where a form is text.
    const text = typeof v === "string" ? s.anyOf.find((x) => "type" in x && x.type === "string") : undefined;
    return text ? check(text, v, at) : `${where}: not ${s.description}`;
  }
  if (s.type === "object") {
    if (!v || typeof v !== "object" || Array.isArray(v)) return `${where}: not an object`;
    for (const k of s.required ?? []) if (!(k in v)) return `${where}: ${k} is missing`;
    for (const [k, x] of Object.entries(v)) {
      const p = s.properties[k];
      if (!p) { if (s.additionalProperties) continue; return `${where}: ${k} is not an argument of this tool`; }
      const e = check(p, x, at ? `${at}.${k}` : k);
      if (e) return e;
    }
    return undefined;
  }
  if (s.type === "array") {
    if (!Array.isArray(v)) return `${where}: not a list`;
    if (v.length > s.maxItems) return `${where}: more than ${s.maxItems} items`;
    if (v.length < (s.minItems ?? 0)) return `${where}: fewer than ${s.minItems} items`;
    for (let i = 0; i < v.length; i++) { const e = check(s.items, v[i], `${where}[${i}]`); if (e) return e; }
    return undefined;
  }
  if (s.type === "string") {
    if (typeof v !== "string") return `${where}: not text`;
    if (v.length > s.maxLength) return `${where}: longer than ${s.maxLength} characters`;
    if (s.enum && !s.enum.includes(v)) return `${where}: not one of ${s.enum.join(", ")}`;
    return undefined;
  }
  if (s.type === "boolean") return typeof v === "boolean" ? undefined : `${where}: not true or false`;
  if (typeof v !== "number" || !Number.isFinite(v) || (s.type === "integer" && !Number.isInteger(v))) return `${where}: not a ${s.type}`;
  return v < s.minimum || v > s.maximum ? `${where}: not between ${s.minimum} and ${s.maximum}` : undefined;
}
// Lenient arguments (R5): before the check, a form that has one meaning is read as the form the tool takes, and the
// reply says so in a line, so the AI app learns it. A whole number for a compound number is its text. An enum's value in
// other letters, after a dot or by another of its names is that value. A required argument left out takes its default.
// "1 (taxol)" as a compound number is number 1 with the caption taxol. Everything else is left for the check to refuse.
// notes: the readings of one call, each kind once: its first line, and how many there were.
type Notes = Map<string, [string, number]>;
const note = (notes: Notes, kind: string, line: string) => { const had = notes.get(kind); if (had) had[1]++; else notes.set(kind, [line, 1]); };
const noted = (notes: Notes) => [...notes.values()].map(([line, n]) => (n > 1 ? `${line.slice(0, -1)}, and ${n - 1} more the same way.` : line));
function coerce(s: Schema | Prop, v: unknown, key: string, notes: Notes): unknown {
  if ("$ref" in s) return coerce(defined(s), v, key, notes);
  if ("anyOf" in s) return s.anyOf.reduce((x, form) => coerce(form, x, key, notes), v);
  if (s.type === "object") {
    if (!v || typeof v !== "object" || Array.isArray(v)) return v;
    const o = v as Record<string, unknown>;
    for (const k of s.required ?? []) if (!(k in o)) { const p = s.properties[k]; if ("default" in p) { o[k] = p.default; note(notes, `${k} default`, `No "${k}" was given: read as ${p.default}.`); } }
    for (const k of Object.keys(o)) { const p = s.properties[k]; if (p) o[k] = coerce(p, o[k], k, notes); }
    const split = s.properties.caption && typeof o.number === "string" && o.caption === undefined ? /^(\S+) \(([^()]+)\)$/.exec(o.number.trim()) : null;
    if (split) { note(notes, "caption", `Read number ${clean(split[0])} as number ${split[1]} with the caption ${clean(split[2])}.`); [, o.number, o.caption] = split; }
    return o;
  }
  if (s.type === "array") { if (Array.isArray(v)) for (let i = 0; i < v.length; i++) v[i] = coerce(s.items, v[i], key, notes); return v; }
  if (s.type !== "string") return v;
  // (A whole number from 0 up: 2.5, -3 and 1e21 are no compound number, and are refused.)
  if (s.numeral && typeof v === "number" && Number.isSafeInteger(v) && v >= 0) { note(notes, `${key} text`, `Read ${key} ${v} as text.`); return String(v); }
  if (s.enum && typeof v === "string" && !s.enum.includes(v)) {
    const t = v.trim().replace(/^\./, "").toLowerCase(), value = s.enum.find((e) => e.toLowerCase() === t) ?? s.also?.[t];
    if (typeof value === "string") { note(notes, `${key} ${value}`, `Read ${key} ${clean(v).slice(0, 40)} as ${value}.`); return value; }
  }
  return v;
}
// A call's arguments, read leniently and then checked: what is wrong with them, or undefined. at: where they are in
// the call (an operation's are at operations[0]).
const wrongWith = (s: Schema, args: unknown, notes: Notes, at = "") => check(s, coerce(s, args, "", notes), at);
// Control characters out of text the AI app gives (a line break stays where text takes one).
const clean = (t: string, lines = false) => t.replace(lines ? /[\u0000-\u0009\u000b-\u001f\u007f]+/g : /[\u0000-\u001f\u007f]+/g, " ").replace(/ {2,}/g, " ").trim();
// Text cut to its first characters, for a result to quote.
const short = (t: string, most: number) => (t.length <= most ? t : `${t.slice(0, most)}…`);

// ---- The tools ----

const structureText = str(MAX_STRUCTURE, "A name (IUPAC, common, trade or abbreviation), CAS number, SMILES, InChI or MOL file");
const num = (minimum: number, maximum: number, description?: string): Prop => ({ type: "number", minimum, maximum, ...(description ? { description } : {}) });
const int = (minimum: number, maximum: number, description?: string): Prop => ({ type: "integer", minimum, maximum, ...(description ? { description } : {}) });
const yes = (description?: string): Prop => ({ type: "boolean", ...(description ? { description } : {}) });
// A point [x, y] in bond lengths, y up, as a read gives boxes.
const POINT: Schema = { ...list(num(-1000, 1000), 2, 2), description: "[x, y], bond lengths, y up" };
// Rich text (F6): runs, each with its own style, as Octet's Text menu sets them on part of a text.
const RUNS = list(obj({ text: str(2000), bold: yes(), italic: yes(), underline: yes(), colour: str(7), script: pick(["sub", "super"]) }, ["text"]), 100, 1);
const RICH = define("rich", { anyOf: [str(2000), RUNS], description: "text, or runs" });
// A structure with set coordinates (F4), for what a SMILES lays out badly (a metal complex, a picture's own layout).
const MOLECULE = obj({
  atoms: list(obj({ label: str(40), runs: RUNS, x: num(-1000, 1000), y: num(-1000, 1000), charge: int(-8, 8), colour: str(7) }, ["x", "y"]), 500, 1),
  bonds: list(obj({ from: int(0, 499), to: int(0, 499), kind: str(20), colour: str(7) }, ["from", "to"]), 600),
}, ["atoms"]);
const FROM_NOTE = "When a compound is an earlier one with a change, give from (its number or id, or previous for the one before in this call) and changes, made in order on its drawing, so it lies the same way and keeps its stereocentres: {swap: {OBn: 'OTES'}} is a group for a group (occurrence: 2 for the second, or at for the one on that atom); {at: '7', set: 'OTBS'} changes the group on an atom, {at, remove: true} takes it off, {at, add: 'OH'} adds one; {bond: '5-6', to: 'double'} is a bond's order. A group is a label (OTBS, CH2OH, =O). at is a map number you gave the atom in a SMILES, with its hydrogens ([C@H:7], [CH2:9]; Octet keeps it and never shows it): the atom stays, and its group is its one part through an atom that is not carbon (OH, OTBS, =O, Br), else its one carbon part. Octet refuses a change with two readings. {do: 'reduce', at: '7', config: 'R'} is a named transformation (advanced help of transformations lists them), also for rings and joins";
const MOLECULE_NOTE = "atoms (from 0) with x, y (bond lengths, y up) and label (none is carbon; a label such as OSiPh3 reads out from the atom, and Octet turns it round on the left), and bonds from, to and kind (as edit's bond; a wedge is narrow at from). Bonds to a metal look best about 1.5 long";
// Orientation hints (R2): a structure from a SMILES or a name, turned as a picture shows it, so an AI app need give no
// coordinates. Each geometry's places for the centre's ligands, in SMILES order: the angle (degrees, anticlockwise
// from right), and the bond: 0 in the plane, 1 in front (a wedge), 6 behind (a hashed wedge), narrow at the centre.
const GEOMETRIES = {
  tetrahedral: [[90, 0], [205, 0], [345, 6], [290, 1]],
  square_planar: [[90, 0], [0, 0], [270, 0], [180, 0]],
  trigonal_bipyramidal: [[90, 0], [270, 0], [180, 0], [30, 6], [330, 1]],
  square_pyramidal: [[90, 0], [150, 6], [210, 1], [30, 6], [330, 1]],
  octahedral: [[90, 0], [270, 0], [150, 6], [210, 1], [30, 6], [330, 1]],
} as const;
type Geometry = keyof typeof GEOMETRIES;
// The hints as a compound takes them (R2), in every kind of draw.
const ORIENT = { up: str(40), down: str(40), left: str(40), right: str(40), rotate: num(-360, 360), flip: pick(["horizontal", "vertical"]), geometry: pick(Object.keys(GEOMETRIES)), colours: { type: "object", properties: {}, additionalProperties: true, description: "{label or element: '#rrggbb'}" }, like: str(40, "Drawn the same way round as this structure (an id such as s3), by the atoms they share") } as const;
// A compound's changes to the one it is from (compound.ts reads each: a tool's list stays short).
const CHANGES = list({ type: "object", properties: {}, additionalProperties: true }, 20), LABELS = { ...list(str(40), 20), description: "One for each *, in order" };
const COMPOUND = define("compound", obj({
  text: structureText,
  molecule: MOLECULE,
  labels: LABELS,
  from: str(40, "With changes: structures says how"), changes: CHANGES,
  number: numeral(12), caption: str(MAX_TEXT),
  ...ORIENT,
}));
// A line over or under an arrow: text, or a compound drawn there.
const condition: Schema = { anyOf: [str(MAX_TEXT), COMPOUND], description: "text, or a compound" };
const ARROWS = ["reaction", "equilibrium", "retro", "resonance", "nogo"] as const;
// A reaction's step, as a reaction and each scheme of a route take it.
const STEP = {
  arrow: pick(ARROWS), products: list(COMPOUND, 6, 1),
  reagents: list(str(MAX_TEXT), 10), catalysts: list(str(MAX_TEXT), 6), solvents: list(str(MAX_TEXT), 4),
  temperature: str(60), time: str(60), atmosphere: str(40), yield: str(40),
  above: list(condition, 6), below: list(condition, 6),
};
const KEEP = yes("Turn each product to lie as its starting material, by the atoms they share (Augmented Clean Up Reaction), so a scheme reads the same way round throughout; true unless set false");
// Every command a chemist has (R7): the menu commands by id (Editor.tsx commands), and the Actions panel's actions on
// the selection by their ids (Editor.tsx runAction), listed for the AI app in run_command's description. A command not
// here is refused, so a misspelt one does nothing.
const MENU_COMMANDS = [
  "undo", "redo", "cut", "copy", "paste", "select_all", "invert_selection", "select_structure", "repeat", "join", "group", "ungroup", "group_integral", "centre_page", "bring_front", "send_back",
  "clean_up", "clean_reaction", "clean_reaction_augmented", "map_reaction", "clear_reaction_map", "flip_h", "flip_v", "mirror_h", "mirror_v", "structure_perspective", "flatten", "clean_3d",
  "expand_label", "contract_label", "hydrogen_display", "aromatic_display", "show_stereo", "atom_numbers", "stereo_clear", "stereo_abs", "stereo_or", "stereo_and", "name_to_structure", "structure_to_name", "make_element", "interpret",
  "add_multicentre", "add_variable", "define_rgroup", "expand_generic", "check_structure", "stoichiometry", "properties", "predict_1h", "predict_13c", "insert_peptide", "insert_rna", "insert_dna",
  "arrange_left", "arrange_centre", "arrange_right", "arrange_top", "arrange_middle", "arrange_bottom", "arrange_across", "arrange_down",
  "text_bold", "text_italic", "text_underline", "text_plain", "text_sub", "text_super", "text_formula", "text_markup", "align_left", "align_centre", "align_right", "align_justify", "align_above", "align_auto", "colour_by_element",
  "zoom_in", "zoom_out", "zoom_actual", "zoom_fit", "centre_view", "show_page", "grid", "rulers", "crosshair", "snap", "snap_grid", "fixed_lengths", "fixed_angles", "warnings", "show_warnings", "hide_warnings", "interpretation", "actions",
  "number", "numbers.roman", "pairs", "delete", "save", "save_as", "print", "export", "rotate_dialog", "scale_dialog", "atom_properties", "bond_properties", "bracket_properties", "document", "page_setup", "experiment_details",
] as const;
// The actions, as the Actions panel's buttons and menus run them: a value goes in the id (scale.120, halo.#FFD6A5).
const ACTIONS = new RegExp(["^(halo|ringfill|colour)\\.(none|#[0-9a-fA-F]{6})$", "^scale\\.\\d{1,4}$", "^rotate\\.(cw|ccw)(15|1)$", "^(charge\\.plus|charge\\.minus|repeat_label|caption\\.add|template\\.add|dictionary\\.add|reaction\\.map|reaction\\.unmap)$",
  "^(element|group)\\.[A-Za-z0-9]{1,20}$", "^label:.{1,40}$", `^bond\\.(${Object.keys(BONDS).join("|")}|left|centre|right|auto|flip|benzene|ring[a-z0-9]{1,16})$`, "^stereo\\.(racemic|relative|absolute|atom\\.(abs|&\\d{1,2}|or\\d{1,2}))$",
  "^caption\\.(bold|italic|underline|plain|sub|super|formula|detach|attach|font\\..{1,40}|size\\.\\d{1,3}(\\.\\d)?|align\\.(left|centre|right|justify|above|auto)|colour\\.#[0-9a-fA-F]{6})$",
  "^arrow\\.(kind\\.[a-z0-9-]{1,30}|size\\.(large|medium|small)|sweep\\.\\d{1,3}|reverse|start\\.(none|full|left|right)|end\\.(none|full|left|right)|head\\.(solid|hollow|angled)|closed|fill\\.(none|solid|shaded|faded)|style\\.(plain|dashed|bold|wavy|doubled)|flip|point|weight\\.\\d{1,4}|above|below)$",
  "^shape\\.(kind\\.(box|rounded|oval|highlight|brackets|parens|braces)|dashed|boldline|depth\\.\\d{1,3}|blur\\.\\d{1,3}|opacity\\.\\d{1,3}|lanes\\.(-1|1|copy)|rf|ticks|transparent|hide\\.(origin|front|border)|spots\\.(filled|hollow|shaded|dashed|bold|doubled)|(row|col)\\.(before|after|delete)|lines\\.(journal|grid|box|none|top|bottom|left|right|header|rows|cols)|align\\.(left|centre|right)|clear|fit|style\\.(plain|dashed|shaded|solid|faded|shadow)|side\\.(left|right|both)|mark\\..{1,12}|colour\\.#[0-9a-fA-F]{6}|front|back)$",
  "^orbital\\.(shape\\.(s|oval|lobe|hybrid|p|d|dz2)|phase\\.(plain|shaded|filled|phased)|swap)$", "^lines\\.weight\\.\\d{1,4}$", "^cycle\\.[a-z.]{1,30}(\\.-?\\d{1,4})?$", "^spot\\.(style\\.[a-z]{1,8}|w\\.\\d{1,4}|h\\.\\d{1,4}|tail\\.\\d{1,4}|rf|delete)$",
  "^grid\\.(limiting|show|layout|remove|hide\\.(row|col))$", "^align\\.(row|column|spread-row)$"].join("|"));
const COMMAND_NOTE = `Runs any Octet command or Actions panel action, as a chemist would, on ids (selected first) or the selection. Menu commands: ${MENU_COMMANDS.join(", ")}. Actions (the value in the id): halo.#rrggbb or halo.none (a highlight behind the selected atoms and the bonds between them), ringfill.#rrggbb or ringfill.none (the rings of the selected atoms), colour.#rrggbb; scale.N (percent of the document style, about the selection's middle); rotate.cw15, rotate.ccw15, rotate.cw1, rotate.ccw1; charge.plus, charge.minus, element.X, label:text, pairs, bond.${Object.keys(BONDS).join("|")}|left|centre|right|auto|flip|benzene|ringchair1|ringchair2|ringcyclopentadiene (the selected bond); stereo.absolute|racemic|relative, stereo.atom.abs|&1|or1; caption.bold|italic|underline|plain|sub|super|formula|detach|attach, caption.font.X, caption.size.N, caption.align.left|centre|right|justify|above|auto, caption.colour.#rrggbb; arrow.kind.X, arrow.size.large|medium|small, arrow.sweep.N, arrow.reverse, arrow.start.none|full|left|right, arrow.end.…, arrow.head.solid|hollow|angled, arrow.closed, arrow.fill.none|solid|shaded|faded, arrow.style.plain|dashed|bold|wavy|doubled, arrow.flip, arrow.point, arrow.weight.N (hundredths of a point), arrow.above, arrow.below (opens conditions text for the user to type: give text with change's text and its arrow instead); shape.kind.box|rounded|oval|highlight|brackets|parens|braces, shape.dashed, shape.boldline, shape.style.plain|dashed|shaded|solid|faded|shadow, shape.depth.N, shape.blur.N, shape.opacity.N, shape.side.left|right|both, shape.mark.X, shape.colour.#rrggbb, shape.front, shape.back; a TLC plate: shape.lanes.1|copy|-1, shape.rf, shape.ticks, shape.transparent, shape.hide.origin|front|border, shape.spots.filled|hollow|shaded|dashed|bold|doubled, spot.style.X, spot.w.N, spot.h.N, spot.tail.N (hundredths of a bond length), spot.rf, spot.delete; a table: shape.row.before|after|delete, shape.col.before|after|delete, shape.lines.journal|grid|box|none|top|bottom|left|right|header|rows|cols, shape.align.left|centre|right, shape.clear, shape.fit; orbital.shape.s|oval|lobe|hybrid|p|d|dz2, orbital.phase.plain|shaded|filled|phased, orbital.swap; lines.weight.N; cycle.gap.N; grid.limiting|show|layout|remove|hide.row|hide.col; align.row|column|spread-row; reaction.map, reaction.unmap. Dialogs (rotate_dialog, atom_properties, save_as, print and the rest) open for the user. detail: full lists what changed.`;
const PURPOSE_PAGES = Object.keys(PAGES) as PageName[];
// A figure (F4): an item in a row, and a panel.
const ITEM = obj({
  structure: structureText, molecule: MOLECULE, labels: LABELS, from: str(40), changes: CHANGES,
  number: numeral(12), caption: RICH, brackets: pick(["brackets", "parens", "braces"]), brackets_bold: yes(), mark: str(12), colour: str(7),
  text: RICH, ...ORIENT,
});
const PANEL = obj({ title: RICH, subtitle: RICH, frame: pick(["none", "line", "fill"]), fill: str(7), rows: list(list(ITEM, 8, 1), 6, 1) }, ["rows"]);
// Placement (F3), the same on every tool that takes it: a point, or beside an object (with what belongs to it, such as
// its number or conditions), a gap clear of it.
const ANCHORS = ["centre", "top_left", "top", "top_right", "left", "right", "bottom_left", "bottom", "bottom_right"] as const;
// Beside an object, or beside the box round several ('$1.made', all a change's first operation made). draw lists only
// the id.
const SIDE: Schema = { anyOf: [str(40), list(str(40), 500, 1)], description: "ids: the box round them" };
const placing = (point: "at" | "to", side: Schema | Prop = SIDE) => ({ [point]: POINT, anchor: pick(ANCHORS), right_of: side, left_of: side, below: side, above: side, gap: num(0, 100), align: pick(["top", "middle", "bottom", "left", "centre", "right"]) });
const PLACE_AT = define("place", { anyOf: [str(40), POINT], description: "an id (s3, t5, s3.2) or a point [x, y] (each from -1000 to 1000)" });
// The properties every kind of object takes (R7), as the Actions panel and the Object, Text, Colour and Curves menus
// set them. edit takes them all; text, arrow and shape take their kind's.
const COLOUR_OR_NONE = str(7, "#rrggbb, or none");
const QUERY = obj({ substituents: pick(["free", "upto", "exactly"]), n: int(0, 15), no_h: yes(), rings: pick(["none", "drawn", "simple", "fusion", "spiro"]), unsaturation: pick(["absent", "present"]), change: yes(), stereo: pick(["inversion", "retention"]), valence: yes() });
const TABLE_IN = obj({ cells: { ...list(list(str(200), 20), 50, 1), description: "Rows; the first is the header" }, lines: pick(["journal", "grid", "box", "none"]), align: list(pick(["left", "centre", "right"]), 20), weight: num(0.1, 10, "pt") });
const SPOT = obj({ lane: int(0, 49), rf: num(0, 1), colour: str(7), style: pick(["filled", "hollow", "shaded"]), dashed: yes(), bold: yes(), doubled: yes(), width: num(0.05, 5), height: num(0.05, 5), tail: num(0, 5), show_rf: yes() }, ["lane", "rf"]);
const TLC_IN = obj({ lanes: int(1, 50), spots: list(SPOT, 200), rf: yes(), origin: num(0, 0.5), front: num(0, 0.5), hide: list(pick(["origin", "front", "border"]), 3), ticks: yes(), transparent: yes() });
const HEAD_SIZE: Schema = { anyOf: [pick(["large", "medium", "small"]), obj({ length: num(1, 100), centre: num(0, 100), width: num(0, 50) }, ["length", "centre", "width"])], description: "large, medium, small, or {length, centre, width} in line widths" };
const LINE_HEIGHT: Schema = { anyOf: [pick(["auto", "variable"]), num(1, 200)], description: "auto, variable, or pt" };
const USAGES: BracketUsage[] = ["sru", "mon", "mer", "co", "alt", "ran", "blk", "xl", "grf", "mod", "c", "mix", "f", "mult", "gen", "anyp", "param"];
const TEXT_STYLE = { bold: { type: "boolean" }, italic: { type: "boolean" }, underline: { type: "boolean" }, size: num(1, 200), font: str(40), colour: COLOUR_OR_NONE } as const;
const ARROW_PROPS = {
  kind: pick([...["reaction", "equilibrium", "resonance", "retro", "nogo", "hash", "dipole", "block", "curved", "fishhook", "double", "line", "arc", "orbital", "cut"]]), style: pick(["plain", "dashed", "bold", "wavy", "doubled"]), start: pick(["none", "full", "left", "right"]), end: pick(["none", "full", "left", "right"]), head: pick(["solid", "hollow", "angled"]),
  head_size: HEAD_SIZE, bend: num(-2, 2), ratio: num(0.1, 10, "An equilibrium's back arrow against its forward one"), shaft: num(0.1, 100, "A block arrow's, in line widths"), line_width: num(0.1, 20, "pt"), fill: pick(["none", "solid", "shaded", "faded"]),
  orbital_shape: pick(ORBITAL_SHAPES), orbital_phase: pick(PHASES),
} as const;
const SHAPE_PROPS = {
  dashed: { type: "boolean" }, bold: { type: "boolean" }, fill: pick(["solid", "shaded", "faded", "none"]), shadow: { type: "boolean" }, mark: str(12), radius: num(0, 20, "bond lengths"),
  line_width: num(0.1, 20, "pt"), bracket_side: pick(["left", "right", "both"]), usage: pick(USAGES, "Bracket Properties: sru a repeating unit, mult a multiple group, the rest as ChemDraw names them"), bracket_label: str(20),
  shade_depth: num(0, 5), shade_blur: num(0, 5), shade_opacity: num(0, 1), table: TABLE_IN, tlc: TLC_IN, png: str(3_500_000, "base64"), rgroup: str(20, "An R-group definition's name (R1)"),
} as const;
const BOX: Schema = { ...list(num(-1000, 1000), 4, 4), description: "[x0, y0, x1, y1], bond lengths, y up" };
const SIZES = { small: 600, medium: 1000, large: 1568 };
// What an AI app names inside a tool (plan 5.1): draw's kinds, change's operations and advanced's tools. Each is an
// operation in OPS, and advanced help gives its whole description and schema.
const KINDS = ["structures", "reaction", "cycle", "figure"] as const;
const CHANGE_OPS = ["edit", "replace", "number", "delete", "move", "arrange", "text", "arrow", "shape", "select"] as const;
const ADVANCED = ["run_command", "set_style", "export", "place_template", "add_file", "fill_experiment"] as const;
// The advanced tools a change can run as an operation, as it can a draw, so that one call draws and then annotates.
// Not the ones that open dialogs or run Undo.
const ALSO_OPS = ["set_style", "place_template", "add_file", "fill_experiment"] as const;
// A batch (F1): a change of more than one operation, at most 40.
const BATCHABLE = [...KINDS, ...CHANGE_OPS, ...ALSO_OPS] as const;
const MOST_STEPS = 40;
const PLACE_NOTE = " Place it with at [x, y] and anchor (the point of its box there; centre by default), or right_of, left_of, below or above an id or ids with gap (1.5) and align. With none, it goes below what is drawn.";

// The one table of operations (D11): what a call does. An AI app reaches each through one of the five tools it is
// given (TOOLS, below), which are short to list. title and description are what advanced help gives for it (none
// where the tool itself says all of it, or an AI app cannot name the operation). hints: what a tool's annotations
// are made from. An operation that is not read-only changes the drawing, as one undo step. done: what the user is
// told the AI app did ("Claude Code drew a reaction."). outputSchema: the shape of the result's structuredContent
// (D9): CHANGE for every operation that changes something.
type Hints = { readOnly: boolean; destructive: boolean; idempotent: boolean };
// place: the operation takes placement (F3), done for it after it draws.
// refuse: what is wrong with the arguments beyond their schema, checked before the call begins (no undo step opens).
type Op = { name: string; title?: string; description?: string; inputSchema: ObjSchema; outputSchema?: object; hints: Hints; done?: string; place?: true; refuse?: (a: any) => string | undefined; run: (host: Host, a: any, ctx: Ctx) => Promise<Result> };
// data: what goes in structuredContent with the change's ids (a write tool) or alone (a read tool).
// extra: what detail: full adds to it (R6), worked out only then: Octet's name for each compound takes time.
// picture: add a PNG of `of` (or the drawing), cropped to `crop`, its long side at most `longest` px. cropped: a picture
// of what the call changed, as picture: true on the call gives (a batch step asked for one). full: detail: full, as
// on the call (a batch step asked for it).
type Result = { text: string; picture?: boolean; error?: true; data?: Record<string, unknown>; extra?: () => Record<string, unknown>; of?: Mol; crop?: Box; longest?: number; cropped?: true; full?: true };
// progress: tells the AI app how far a long call is (when it asked); check: stops the call here when it was cancelled
// (notifications/cancelled, or Stop in Octet's notice), and the drawing goes back as it was.
// watched: the AI app asked for progress, so a long call shows each part as it goes.
// notes: what the call's arguments were read as (coerce), for the reply.
// brief: the session's brief (set_brief), as Octet kept it; keep: keeps a new one for the session.
type Ctx = { session?: string; client: string; progress: (done: number, total?: number, message?: string) => void; check: () => Promise<void>; watched?: boolean; notes: Notes; brief?: string; keep?: From["keep"] };
class Cancelled extends Error {}
const READ: Hints = { readOnly: true, destructive: false, idempotent: true }, ADD: Hints = { readOnly: false, destructive: false, idempotent: false };
// move is not destructive: it loses nothing and Undo puts it back (plan, section 8, decision 2).
const CHANGE_SAFE: Hints = { readOnly: false, destructive: true, idempotent: true }, CHANGE_ONCE: Hints = { readOnly: false, destructive: true, idempotent: false };
const ids = { type: "array", items: { type: "string" } };
// What every write tool's structuredContent holds (D9, R6): what was done, the ids of the top-level objects made, the
// chemical warnings the call caused and Octet's check of the layout.
// (Kept short: draw and change list it. The boxes are in it too, unlisted, and all that detail: full adds: the
// drawing, every id made, changed and deleted, Octet's reading of each name given, and the layout's warnings.)
const CHANGE = { type: "object", required: ["done", "made", "warnings", "check"], properties: { made: ids, warnings: ids } };
// detail on a read, and on every operation whose result is a change: short unless full is asked for (R6).
const detail = (unlisted?: true) => pick(["summary", "full"], undefined, { also: { short: "summary", brief: "summary" }, ...(unlisted && { unlisted }) });
const PICTURE_SIZE = Object.keys(SIZES), PURPOSES = ["paper", "thesis", "slides", "poster", "experiment", "quick"];
const DRAWINGS = { type: "object", required: ["using", "drawings"], properties: { using: { type: "string" }, drawings: { type: "array", items: { type: "object", properties: { id: { type: "string" }, title: { type: "string" }, edited: { type: "boolean" } } } } } };
const READING = { type: "object", required: ["drawing", "structures", "reactions", "warnings"], properties: { drawing: { type: "object" }, style: { type: "string" }, page: { type: "string" }, structures: { type: "array" }, reactions: { type: "array" }, cycles: { type: "array" }, text: { type: "array" }, arrows: { type: "array" }, selected: ids, warnings: { type: "array" } } };

// The brief (plan section 3, Sam's rule): the three questions the user is asked before a scheme, route, figure, cycle
// or grid is drawn, and set_brief's arguments, their answers in the same order.
const QUESTIONS = "1. Do you have a preferred working style? If so, ask them for a drawing in it. 2. Where is this going, and how big does it need to be? 3. Is there anything to emphasise, or a layout to follow?";
const BRIEF_FIRST = `Octet needs the brief first. Ask the user these three questions, then call set_brief: ${QUESTIONS}`;
const DESTINATIONS = ["quick", "paper", "thesis", "slides", "poster", "notebook"] as const;
// The journals' presets by the short names a user gives them (journalOf reads each as its preset).
const JOURNALS = Object.keys(PRESETS).filter((p) => !p.includes("ChemDraw")).map((p) => p.replace(/ Document 1996| \(.*\)/, ""));
const BRIEF_IN = obj({
  style: { ...obj({ from_file: str(1_000_000), from_drawing: str(40), none: { type: "boolean", unlisted: true } }), description: "1. from_file: a CDXML or .oct file's text, whose style Octet uses; from_drawing: this drawing's id, to keep its style" },
  destination: { ...obj({ kind: pick(DESTINATIONS), journal: str(80), columns: int(1, 2), size_mm: list(num(20, 2000), 2, 2) }, ["kind"]), description: `2. journal: ${JOURNALS.join(", ")}; columns: 1 or 2, its column's width; size_mm: [w, h], the page` },
  emphasis: str(2000, "3. In the user's words"), layout: str(2000),
}, ["destination"]);

const OPS: Op[] = [
  {
    name: "read", hints: READ, outputSchema: READING,
    inputSchema: obj({ picture: yes(), picture_size: pick(PICTURE_SIZE, "The picture's long side: 600, 1000 (default) or 1568 px"), ids: list(str(40), 500), detail: detail(), smiles: yes(), atoms: yes("Each structure's atoms (s3.2) and bonds (s3.1-2), for edit") }),
    // One snapshot (D3): the JSON and the picture are of the same drawing.
    run: async (host, a) => {
      await host.ready();
      // An atom or bond id (s3.2, s3.1-2) reads its structure.
      const m = host.doc(), only = a.ids?.length ? (a.ids as string[]).map((id) => (bondOf(m, id, host) ?? atomOf(m, id, host)) === undefined ? id : id.replace(/\.[\d-]+(?::pair)?$/, "")) : undefined;
      if (only) { const { unknown } = idsOf(host, m, only); if (unknown.length) return { text: `There is nothing with the id ${unknown.join(", ")}. Call read without ids for every id.`, error: true }; }
      const data = summary(host, m, a.detail === "full", !!a.atoms, only, !!a.smiles);
      return { text: JSON.stringify(data), picture: !!a.picture, data, of: m, crop: only && boxOfIds(host, m, only, 1), longest: SIZES[(a.picture_size ?? "medium") as keyof typeof SIZES] };
    },
  },
  {
    name: "structures", title: "Draw structures", hints: ADD, outputSchema: CHANGE, done: "drew structures",
    description: "Draws structures (a name, CAS number, SMILES, InChI or MOL file) in a numbered grid below what is drawn (one row for 6 or fewer where the page has room, unless columns is set). Give the name when you know it. Each takes number (bold, under it) and caption (text under the number). For a generic group (L, R, Ar), give a SMILES with * and labels ('*c1ccccc1', ['Ar']). To match a picture, every compound of every kind takes: up, down, left or right, an atom that points that way (a label, an element, or #n for the n-th atom of the SMILES, from 0; a second one sets which way round), rotate (degrees, anticlockwise) and flip; geometry, which puts the ligands of the atom with most bonds at fixed places in SMILES order (octahedral: up, down, upper left behind, lower left in front, upper right behind, lower right in front; tetrahedral: up, lower left, right behind, lower right in front; square_planar: up, right, down, left; trigonal_bipyramidal: up, down, left, upper right behind, lower right in front; square_pyramidal: up, upper left behind, lower left in front, upper right behind, lower right in front); and colours for labels ({OSiPh3: '#E0352B', N: '#2B3FE0'}). " + FROM_NOTE + ". Use molecule only when the hints cannot match the picture (a chelate ring, a cage): " + MOLECULE_NOTE + "." + PLACE_NOTE,
    inputSchema: obj({ structures: list(COMPOUND, MOST_STRUCTURES, 1), columns: int(1, 20), ...placing("at") }, ["structures"]),
    run: drawStructures, place: true,
  },
  {
    name: "reaction", title: "Draw a reaction or scheme", hints: ADD, outputSchema: CHANGE, done: "drew a reaction",
    description: "Draws a reaction or a scheme in a row: starting materials, then for each step an arrow, its conditions and its products. Give conditions as data: reagents, then catalysts, go over the arrow; solvents, temperature, time and atmosphere under it, then the yield. above and below add one line each ('1. n-BuLi, THF, -78 °C'), or a compound drawn at the arrow ('structure:' before a name does too). Octet lays it out with Clean Up Reaction and wraps between steps to fit the page, so keep lines short: a list over 30 characters goes on more lines between its items, and a free line after a comma or semicolon. read gives the compounds at an arrow after its text lines. Each compound takes labels, from with changes, number, caption and the hints structures lists. Example: start [{text:'acetic acid'},{text:'ethanol'}], steps [{reagents:['H2SO4 (cat.)'], temperature:'reflux', yield:'90%', products:[{text:'ethyl acetate', number:'1'}]}]." + PLACE_NOTE,
    inputSchema: obj({ start: list(COMPOUND, 6, 1), steps: list(obj(STEP, ["products"]), 20, 1), keep_orientation: KEEP, ...placing("at") }, ["start", "steps"]),
    run: drawReaction, place: true,
  },
  {
    // A route (plan 5.4): draw_route's one operation. Its schemes are reactions as the one above draws them.
    name: "route", title: "Draw a route", hints: ADD, outputSchema: CHANGE, done: "drew a route",
    inputSchema: obj({ title: str(MAX_TEXT), schemes: list(obj({ title: str(MAX_TEXT), start: list(COMPOUND, 6, 1), steps: list(obj({ ...STEP, label: str(40) }, ["products"]), 20, 1) }, ["start", "steps"]), 10, 1), legend: pick(["none", "letters"]), keep_orientation: KEEP }, ["schemes"]),
    run: drawRoute,
  },
  {
    name: "cycle", title: "Draw a catalytic cycle", hints: ADD, outputSchema: CHANGE, done: "drew a catalytic cycle",
    description: "Draws a catalytic cycle: the intermediates round a circle joined by arc arrows, centre text in the middle, and side arrows for what goes in and out. Step k (from 0) runs from intermediate k to k+1, the last back to the first. For a ligand L, give '*[Pd]*' with labels ['L', 'L']. Keep step names short (OA, TM, RE) on a small cycle; \n starts a second line. After changing an intermediate, select the cycle and run clean_up. Each compound takes from with changes and the hints structures lists." + PLACE_NOTE,
    inputSchema: obj({
      intermediates: list(COMPOUND, 12, 2),
      centre: str(MAX_TEXT),
      steps: list(obj({ step: { type: "integer", minimum: 0, maximum: 11 }, in: str(MAX_TEXT), out: str(MAX_TEXT), name: str(MAX_TEXT) }, ["step"]), 12),
      anticlockwise: yes(),
      ...placing("at"),
    }, ["intermediates"]),
    run: drawCycle, place: true,
  },
  {
    name: "replace", title: "Replace a structure", hints: CHANGE_ONCE, outputSchema: CHANGE, done: "replaced a structure",
    description: "Replaces a structure (its id) with another (text, or a compound's from and changes; changes alone change it) in the same place, keeping its number and caption. The new one has a new id.",
    inputSchema: obj({ structure: str(12), text: structureText, from: str(40), changes: CHANGES }, ["structure"]),
    run: replaceStructure,
  },
  {
    name: "delete", title: "Delete", hints: CHANGE_SAFE, outputSchema: CHANGE, done: "deleted part of the drawing",
    description: "Deletes structures, atoms (s3.2, with their bonds), bonds (s3.1-2), text, arrows, shapes or cycles by id. A cycle's id is all of it.",
    inputSchema: obj({ ids: list(str(12), 500, 1) }, ["ids"]),
    run: remove,
  },
  {
    name: "text", title: "Add text", hints: ADD, outputSchema: CHANGE, done: "added text",
    description: "Adds text (a title, caption or note), or with id replaces a caption's text. size (pt), font, bold, italic, underline, colour and text_align set it all; runs style parts (bold, italic, colour, sub, super); plain text gets chemistry formatting (H2SO4). arrow (a7) with side puts it on that arrow as its conditions, as Add conditions above or below do: Octet centres it on the arrow, it moves with the arrow, and Clean Up Reaction lays it out. width wraps lines to it (bond lengths); line_height is auto, variable or pt; angle turns it (degrees, anticlockwise)." + PLACE_NOTE,
    inputSchema: obj({ text: str(2000), runs: RUNS, id: str(12), ...TEXT_STYLE, text_align: pick(["left", "centre", "right", "justify"]), width: num(0.5, 300), line_height: LINE_HEIGHT, angle: num(-360, 360), arrow: str(12), side: pick(["above", "below"]), ...placing("at") }),
    run: addText, place: true,
  },
  {
    name: "set_style", title: "Document style", hints: CHANGE_SAFE, outputSchema: CHANGE, done: "changed the document style",
    description: `Sets the style and page, as Document settings do: a preset (${Object.keys(PRESETS).join("; ")}; it keeps the page) and a page (ACS1: JACS one column, 3.25 in; ACS2: two columns, 7 in), or page_size in mm. Octet redraws everything in the new style.`,
    inputSchema: obj({ preset: pick(Object.keys(PRESETS)), page: pick(PURPOSE_PAGES), landscape: { type: "boolean" }, page_size: list(num(20, 2000), 2, 2) }),
    run: setStyle,
  },
  {
    name: "fill_experiment", title: "Fill in the experiment page", hints: CHANGE_SAFE, outputSchema: CHANGE, done: "filled in the experiment page",
    description: `On an experiment page: sets its details (${FIELDS.map(([, n]) => n).join(", ")}) and the reagent table's amounts for a reaction already drawn. of names a compound (its name, SMILES, number or the reagent's text). Amounts take units: '6.0 g', '100 mmol', '1.2 eq', '5.7 mL', '98%'. Give one of mass, moles or volume for each (Octet works out the rest), and the product's mass as measured, for the yield. A volume needs a density or a molarity. Each compound the conditions name (solvents and the atmosphere's gas too) has a column, and one with no amount counts as 1.00 eq.`,
    inputSchema: obj({
      details: obj(Object.fromEntries(FIELDS.map(([k]) => [k, str(200)]))),
      amounts: list(obj({ of: str(MAX_STRUCTURE), mass: str(40), moles: str(40), equiv: str(40), volume: str(40), density: str(40), molarity: str(40), purity: str(40), measured: str(40), limiting: { type: "boolean" } }, ["of"]), 40),
    }),
    run: fillExperiment,
  },
  {
    name: "select", title: "Select", hints: READ, outputSchema: CHANGE,
    description: "Selects these ids (an empty list clears it), so run_command acts on them.",
    inputSchema: obj({ ids: list(str(12), 500) }, ["ids"]),
    run: select,
  },
  {
    name: "add_file", title: "Add a drawing from file text", hints: ADD, outputSchema: CHANGE, done: "added a drawing",
    description: "Adds a drawing from a file's text: CDXML, MOL, SDF, RXN, SMILES or InChI. CDXML and MOL keep their coordinates, labels and colours; Octet lays out SMILES and InChI. Pictures (CDXML) too." + PLACE_NOTE,
    inputSchema: obj({ text: str(1_000_000), ...placing("at") }, ["text"]),
    run: addFile, place: true,
  },
  {
    name: "place_template", title: "Place a library template", hints: ADD, outputSchema: CHANGE, done: "placed a template",
    description: "Places a template from Octet's library by name, as the Template tool does: a structure (ATP, ferrocene) or a picture (Round-bottom flask, microscope, cell). set when two sets share a name. on: an atom (s3.2) or bond (s3.1-2) to put it on." + PLACE_NOTE,
    inputSchema: obj({ name: str(80), set: str(40), on: str(20), ...placing("at") }, ["name"]),
    run: placeTemplate, place: true,
  },
  {
    name: "new", hints: ADD, outputSchema: CHANGE, done: "opened a new drawing",
    description: "drawings new: a new drawing for a purpose, in a window of its own. text: a file's text (CDXML, CDX in base64, .oct, MOL, SDF, RXN, CML, SMILES or InChI), which opens as File > Open opens it, in its own style.",
    inputSchema: obj({ for: pick(PURPOSES, undefined, { default: "quick" }), text: { ...str(1_000_000), unlisted: true } }, ["for"]),
    run: newDrawing,
  },
  {
    name: "export", title: "Export", hints: READ, outputSchema: CHANGE,
    description: "Opens Octet's Export dialog on a format. The user chooses where to save: Octet never saves a file for an AI app.",
    inputSchema: obj({ format: pick(["pdf", "png", "svg", "emf", "eps", "tif", "jpg", "gif", "cdxml", "cdx", "mol", "sdf", "rxn", "smi", "inchi", "oct"], undefined, { also: { tiff: "tif", jpeg: "jpg", smiles: "smi" } }) }, ["format"]),
    run: async (host, a) => (host.windowless() ? { text: NO_DIALOG, error: true } : host.export(a.format) ? { text: `Octet shows its Export dialog with ${a.format.toUpperCase()} chosen. The user picks where the file goes.` } : { text: "Octet cannot open the Export dialog now.", error: true }),
  },
  {
    name: "list", hints: READ, outputSchema: DRAWINGS,
    inputSchema: obj({}),
    run: async (host) => { const data = { using: host.window().id, drawings: (await host.windows()).map((w) => ({ id: w.id, title: w.name, edited: w.edited })) }; return { text: JSON.stringify(data, null, 1), data }; },
  },
  {
    name: "use", hints: READ, outputSchema: CHANGE,
    inputSchema: obj({ drawing: str(40) }, ["drawing"]),
    run: async (host, a, ctx) => ((await host.target(ctx.session, a.drawing)) ? { text: `This session's calls now go to ${a.drawing}.` } : { text: `There is no drawing ${a.drawing}. Call drawings for the ids.`, error: true }),
  },
  {
    name: "move", title: "Move", hints: ADD, outputSchema: CHANGE, done: "moved part of the drawing",
    description: "Moves the ids together, with what belongs to them (numbers, conditions): by dx, dy, or to [x, y] with anchor, or right_of, left_of, below or above an id or ids with gap and align. Text Octet places itself (numbers, conditions, a cycle's text) moves only with its structure, arrow or cycle. An atom (s3.2) or bond (s3.1-2) moves alone, its bonds stretching.",
    inputSchema: obj({ ids: list(str(40), 500, 1), dx: num(-1000, 1000), dy: num(-1000, 1000), ...placing("to") }, ["ids"]),
    run: move,
  },
  {
    name: "number", title: "Compound number", hints: CHANGE_SAFE, outputSchema: CHANGE, done: "numbered a compound",
    description: "Sets a structure's number (bold, under it); an empty number takes it away.",
    inputSchema: obj({ structure: str(12), number: numeral(12) }, ["structure", "number"]),
    run: setNumber,
  },
  {
    name: "arrange", title: "Align or distribute", hints: ADD, outputSchema: CHANGE, done: "lined up part of the drawing",
    description: "Lines up the ids as Object > Align, Distribute and Centre on Page do: left, centre, right, top, middle or bottom (on the highest one); across and down space them evenly; page centres them on the page. same_width, same_height and same_size make shapes as big as the largest, each keeping its top left corner.",
    inputSchema: obj({ ids: list(str(40), 500, 1), how: pick(["left", "centre", "right", "top", "middle", "bottom", "across", "down", "page", "same_width", "same_height", "same_size"]) }, ["ids", "how"]),
    run: arrange,
  },
  {
    name: "file", hints: READ, outputSchema: { type: "object", required: ["format", "text"], properties: { format: { type: "string" }, text: { type: "string" }, ids: ids } },
    description: `read with format: the drawing (or the ids) as the file Export writes, in any of its formats (${FILE_FORMATS.join(", ")}), a binary one in base64. mol, sdf, rxn and rdf are V3000; mol2000, sdf2000, rxn2000 and rdf2000 are V2000. A picture takes Export's options: dpi (36 to 2400), transparent, and width_mm (the whole picture, margin included). Nothing is saved.`,
    // (tools/list lists the formats read had before; the rest, and the options, are here for room.)
    inputSchema: obj({ format: pick(FILE_FORMATS, undefined, { also: { smi: "smiles", tiff: "tif", jpeg: "jpg" }, quiet: FILE_FORMATS.slice(8) }), ids: list(str(40), 500), dpi: { ...num(36, 2400), unlisted: true }, transparent: { type: "boolean", unlisted: true }, width_mm: { ...num(1, 2000), unlisted: true } }, ["format"]),
    run: getFile,
  },
  {
    name: "edit", title: "Change objects", hints: CHANGE_ONCE, outputSchema: CHANGE, done: "changed part of the drawing",
    description: "Changes what the ids name: every property the Actions panel and the Object, Text, Colour and Curves menus set. Each goes on every id it fits, and the result says what did not fit. Everything: colour (#rrggbb, or none for the document's ink), highlight (#rrggbb or none: a pale disc behind an atom's label, a band behind a bond, every atom and bond of a structure), rotate (degrees, anticlockwise, about its middle), scale (percent of the document style). An atom (s3.2; ids from read with atoms: true): label, runs, charge, isotope, radical, lone_pairs, bars (lone pairs as bars), enhanced (abs, or1, &1), align (which way the label reads: left from the atom, right to it as in MeO, centre, above, below or auto), atom_number (shown beside it; '' takes it off), hidden (an explicit H not drawn), chemical (false reads the label as text), bold, italic, underline, size, font, label_angle, query (search properties), ignore_warnings (Display Warnings off). A bond (s3.1-2): bond, ignore_warnings, position (a double bond's second line: left, centre, right or auto), spacing (% of the bond length), topology, reaction_centre, bond_query. A structure (s3 or its number): structure (a name or SMILES, in place), changes (a compound's), number, ignore_warnings, flip (horizontal or vertical, keeping stereocentres), ring_fill (#rrggbb or none, its rings), perspective (depth shading), stereo_labels (R/S and E/Z shown), atom_numbers, aromatic_circles. Text (t5): text or runs, bold, italic, underline, size, font, align, width, line_height, arrow with side (put on that arrow as its conditions; arrow none frees it), chemical. An arrow (a7): kind, style, start and end (the heads), head, head_size, bend, ratio, shaft, line_width (pt), fill, orbital_shape, orbital_phase, from and to (points). A shape (b2): kind, dashed, bold, fill (a flat panel is solid with a light colour; faded fades to nothing), shadow, shade_depth, shade_blur, shade_opacity, mark, radius, line_width, bracket_side, usage and bracket_label (brackets), box [x0, y0, x1, y1], table, tlc, png (a picture), rgroup; a table's or plate's text takes bold, italic, underline, size and font.",
    inputSchema: obj({
      ids: list(str(40), 500, 1), label: str(40), charge: int(-8, 8), isotope: int(0, 300), radical: pick(RADICALS), lone_pairs: int(0, 4), bars: { type: "boolean" }, enhanced: str(8), atom_number: numeral(8), hidden: { type: "boolean" }, chemical: { type: "boolean" }, label_angle: num(-360, 360), query: QUERY,
      bond: pick(Object.keys(BONDS)), position: pick(["left", "centre", "right", "auto"]), spacing: num(1, 100), topology: pick(["ring", "chain", "either", "none"]), reaction_centre: pick(["centre", "makebreak", "change", "makechange", "not", "nochange", "unmapped", "none"]), bond_query: pick(["any", "sd", "sa", "da", "none"]),
      ignore_warnings: { type: "boolean" }, highlight: COLOUR_OR_NONE, ring_fill: COLOUR_OR_NONE, rotate: num(-360, 360), scale: num(10, 1000), flip: pick(["horizontal", "vertical"]), perspective: { type: "boolean" }, stereo_labels: { type: "boolean" }, atom_numbers: { type: "boolean" }, aromatic_circles: { type: "boolean" },
      text: str(2000), runs: RUNS, ...TEXT_STYLE, align: pick(["left", "centre", "right", "justify", "above", "below", "auto"]), width: num(0.5, 300), line_height: LINE_HEIGHT, arrow: str(12, "a7, or none"), side: pick(["above", "below"]),
      ...ARROW_PROPS, kind: pick([...["reaction", "equilibrium", "resonance", "retro", "nogo", "hash", "dipole", "block", "curved", "fishhook", "double", "line", "arc", "orbital", "cut"], ...["box", "rounded", "oval", "highlight", "brackets", "parens", "braces"]]), from: POINT, to: POINT,
      ...SHAPE_PROPS, structure: str(MAX_STRUCTURE), changes: CHANGES, number: numeral(12), box: BOX,
    }, ["ids"]),
    run: edit,
  },
  {
    name: "arrow", title: "Add an arrow", hints: ADD, outputSchema: CHANGE, done: "drew an arrow",
    description: "Draws one arrow, line, orbital or fragmentation cut. curved and fishhook push electrons from an atom (s3.2), a lone pair (s3.2:pair) or a bond (s3.1-2) to an atom or bond; bend sets the bow (0.3; below 0 bows the other way). Other kinds go between two ids or points [x, y] (a line from [-10, 0] to [10, 0] divides a figure). An orbital goes from its nucleus (an atom) to the tip of its main lobe, with orbital_shape and orbital_phase. style, start, end, head, head_size, ratio, shaft, line_width, fill and colour are as edit takes them. For a reaction, use draw_route. To add a step to a scheme: draw its product right_of the last one (gap: 1 + 0.4 a character of the arrow's text), a reaction arrow between them and text on it, then advanced run_command clean_reaction.",
    inputSchema: obj({ ...ARROW_PROPS, from: PLACE_AT, to: PLACE_AT, colour: str(7) }, ["kind", "from", "to"]),
    run: addArrowTool,
  },
  {
    name: "shape", title: "Add a shape", hints: ADD, outputSchema: CHANGE, done: "drew a shape",
    description: "Draws a frame or panel: a box, rounded box, oval, highlight (a pale panel behind a whole region), brackets, TLC plate, table or picture round the ids. Not for highlighting atoms or groups: that is edit with highlight (Octet's Highlight). It goes round the ids (pad 0.5 bond lengths, 0.3 for brackets; an atom id such as s3.2 is its label), or at a box [x0, y0, x1, y1]. dashed, bold, fill (a flat panel is solid with a light colour; faded fades to nothing), shadow, mark (‡, n, 2+ on brackets), radius, line_width, bracket_side, usage, bracket_label, colour, table (cells, lines, align), tlc (lanes, spots) and png (base64) are as edit takes them. angle turns it (degrees, anticlockwise).",
    inputSchema: obj({ kind: pick(["box", "rounded", "oval", "highlight", "brackets", "parens", "braces", "tlc", "table", "picture"]), around: list(str(40), 200, 1), box: BOX, pad: num(0, 20), angle: num(-360, 360), colour: str(7), ...SHAPE_PROPS }, ["kind"]),
    run: addShapeTool,
  },
  {
    name: "run_command", title: "Run an Octet command", hints: CHANGE_ONCE, outputSchema: CHANGE, done: "ran a command",
    description: COMMAND_NOTE,
    inputSchema: obj({ command: str(80), ids: { ...list(str(40), 500), description: "Selected first, so the command acts on them (an empty list clears the selection)" } }, ["command"]),
    refuse: (a) => (knownCommand(a.command) ? undefined : `Octet has no command ${String(a.command).trim().slice(0, 40)}. advanced help of run_command lists them`),
    run: runCommand,
  },
  {
    name: "figure", title: "Draw a figure", hints: ADD, outputSchema: CHANGE, done: "drew a figure",
    description: "Draws a whole figure in one call, laid out in the drawing's style: panels one under another, the same width, each with a bold title and a subtitle (a citation) at its top left, then rows of items in equal columns, their middles on one line. An item is a structure (a name, SMILES, MOL or CDXML, with labels and the hints structures lists; or a molecule; or from with changes) with its number (bold, under it), caption (under the number, or over it with number_under_caption; \n for a second line), brackets (brackets, parens or braces, a mark such as n or 2+, brackets_bold) and colour; or text alone ('when M = Ce'). Any text can be runs. frame: none, line or fill (a flat rounded panel). colour_by_element colours labels as Colour by Element does; element_colours sets your own, by element or label. detail: full gives each part's id by place. Example: panels [{title:'A  Siloxides', subtitle:'Mazzanti et al.', rows:[[{structure:'*[Ce](*)(*)(*)(*)(N#CC)N#CC', labels:['OSiPh3','OSiPh3','OSiPh3','OSiPh3'], geometry:'octahedral', number:'S-2', caption:'M = Ce, Pr'}, {text:'and'}]]}]." + PLACE_NOTE,
    inputSchema: obj({ panels: list(PANEL, 8, 1), number_under_caption: yes(), colour_by_element: yes(), element_colours: { type: "object", properties: {}, additionalProperties: true, description: "{O: '#C42B2B', OSiPh3: '#E0352B'}" }, width: num(5, 300, "Bond lengths; by default the page inside its margins (about 35 on A4 in ACS style)"), ...placing("at") }, ["panels"]),
    run: drawFigure, place: true,
  },
  {
    name: "brief", hints: { readOnly: false, destructive: false, idempotent: true }, done: "set the brief", outputSchema: { type: "object", required: ["brief"], properties: { brief: { type: "object" } } },
    inputSchema: BRIEF_IN, run: (host, a, ctx) => setBrief(host, a, ctx),
  },
  {
    // A change of more than one operation.
    name: "batch", hints: CHANGE_ONCE, outputSchema: CHANGE, done: "made several changes",
    inputSchema: obj({ steps: list(obj({ tool: pick(BATCHABLE), args: { type: "object", properties: {}, additionalProperties: true } }, ["tool", "args"]), MOST_STEPS, 1) }, ["steps"]),
    run: (host, a, ctx) => batch(host, a, ctx),
  },
  {
    // advanced help: an operation's whole description and schema, which the five tools are too short to hold.
    name: "help", hints: READ,
    inputSchema: obj({ of: str(40) }),
    run: async (_, a) => {
      const of = clean(a.of ?? "").toLowerCase(), t = HELP.includes(of) ? opOf(of === "draw_route" ? "route" : of) : undefined;
      // The named transformations a compound's change takes as do (compound.ts), which draw names in one example.
      if (of === "transformations") { const data = { of, call: "a compound's changes: {do, at, with, to, config}", description: TRANSFORMATIONS }; return { text: JSON.stringify(data), data }; }
      if (!t) return { text: `${of ? `Octet has nothing named ${short(of, 40)}. ` : ""}Give of: a kind of draw (${KINDS.join(", ")}), an operation of change (${CHANGE_OPS.join(", ")}), a tool of advanced (${ADVANCED.join(", ")}), draw_route, file (read with format), new (drawings new) or transformations (a compound's changes with do).`, ...(of ? { error: true as const } : {}) };
      const call = of === "draw_route" ? of : of === "file" ? "read with format" : of === "new" ? "drawings with action: 'new'" : KINDS.includes(of as never) ? `draw with kind: '${of}'` : CHANGE_OPS.includes(of as never) ? `change, as an operation with op: '${of}'` : `advanced with tool: '${of}' and args`;
      const data = { of, call, does: t.title, description: t.description, arguments: whole(t.inputSchema) };
      return { text: JSON.stringify(data), data };
    },
  },
];
// Every operation that changes the drawing takes picture: true, for a picture of what it made or changed (F2), with
// picture_size; every one whose result is a change takes detail: full, for all the result's data (R6). The tool that
// runs the operation lists them, so the operation's own schema (advanced help) does not.
for (const t of OPS) {
  if (!t.hints.readOnly) Object.assign(t.inputSchema.properties, { picture: { type: "boolean", unlisted: true }, picture_size: pick(PICTURE_SIZE, undefined, { unlisted: true }) });
  if (t.outputSchema === CHANGE) t.inputSchema.properties.detail ??= detail(true);
}

// ---- The five tools an AI app is given (plan 5.1 and 5.2) ----

// tools/list is read at the start of every chat, so it is short: under 14,000 characters (the 26 tools of v1 were
// 59,900). Each tool lists what an AI app needs to call it right at the first try, and advanced help gives the rest.
// inputSchema: the arguments as listed (defs: its $defs). A call is checked against its operation's own schema.
// ops: the operations the tool runs: its annotations and outputSchema are made from theirs.
// route: the operation a call is, with that operation's arguments and where they are in the call (at); or what is
// wrong with the call.
type Tool = { name: string; title: string; description: string; inputSchema: ObjSchema; defs?: Record<string, Schema>; ops: readonly string[]; route: (a: any, notes: Notes) => { op: string; args: any; at?: string } | string };
const BY_NAME = new Map(OPS.map((t) => [t.name, t])), opOf = (name: string) => BY_NAME.get(name)!;
const HELP: readonly string[] = [...KINDS, ...CHANGE_OPS, ...ADVANCED, "draw_route", "file", "new"];
// The values an operation's argument takes, for a tool's description to list.
const values = (op: string, key: string) => (opOf(op).inputSchema.properties[key] as { enum: readonly string[] }).enum.join(", ");
const open = (properties: Record<string, Schema | Prop>, required: string[] = []): ObjSchema => ({ ...obj(properties, required), additionalProperties: true });
// What a tool that changes the drawing takes for its result.
const REPLY = { picture: yes(), picture_size: pick(PICTURE_SIZE), detail: detail() };
// An argument the tool lists (for its other operations) that this operation does not take, said as it is: not "is not
// an argument of this tool".
const stray = (a: object, listed: ObjSchema, op: string, what: string) => { const k = Object.keys(a).find((k) => k in listed.properties && !(k in opOf(op).inputSchema.properties)); return k && `${k} does not go with ${what}`; };
// The compound as draw lists it: what most calls give. Its hints and molecule are in advanced help.
const LISTED_COMPOUND: Schema = { ...obj({
  text: str(MAX_STRUCTURE, "A name, CAS number, SMILES, InChI or MOL file"), labels: LABELS,
  from: str(40, "An earlier compound, by its number or id, or previous (the one before in this call)"),
  changes: { ...list(obj({ swap: { type: "object", properties: {}, additionalProperties: true }, occurrence: int(1, 99), at: str(40), set: str(40), add: str(40), remove: yes(), bond: str(40), to: pick(["single", "double", "triple"]) }), 20), description: "Made in order on from's drawing: it lies the same way and keeps its stereocentres. {swap: {OBn: 'OTES'}} (occurrence: 2, the second such group); {at: '7', set: 'OTBS'}; {at, add: 'OH'}; {at, remove: true}; {bond: '5-6', to: 'double'}. A group is a label (OTBS, CH2OH, =O); at, a map number you gave in a SMILES, with its hydrogens ([C@H:7]); {do: 'reduce', at: '7', config: 'R'}, a named transformation (advanced help of transformations lists them), also for rings and joins" },
  number: numeral(12), caption: str(MAX_TEXT),
}), description: "text, or from with changes. number is bold under it, caption under the number" };
const COMPOUNDS = list({ $ref: "#/$defs/compound" }, MOST_STRUCTURES), TEXTS = list(str(MAX_TEXT), 10);
// The compounds as draw_route lists them: each as draw takes it, which its description says (draw lists the parts).
const ROUTE_COMPOUNDS = list({ type: "object", properties: {}, additionalProperties: true }, MOST_STRUCTURES);
const KIND = open({ kind: pick(KINDS) }, ["kind"]);
// (A tool's description is 2,000 characters at most: mcp.rs puts it in Claude Desktop's bundle, which takes no more.
// So what each operation takes is said on the argument.)
const OPERATIONS = obj({ operations: { ...list(open({ op: pick(["draw", ...CHANGE_OPS, ...ALSO_OPS]), ids: list(str(40), 500) }, ["op"]), MOST_STEPS, 1), description: `Each is an op with its arguments beside it.
edit: ids, and any property of what they name: colour, highlight (#rrggbb or none), rotate, scale; an atom's label, charge; a bond's bond (single, double, wedge and more); a structure's structure (a name or SMILES), changes, flip, ring_fill; text's text, bold, size; an arrow's kind, style; a shape's fill.
replace: structure (its id), and text, or changes. It keeps its place, number and caption, with a new id.
number: structure, number ('' takes it away). To renumber several, name each by its id: a number names the first structure that has it.
delete: ids.
move: ids, and dx, dy, or to [x, y] with anchor, or right_of, left_of, below or above ids with gap and align.
arrange: ids, how (left, top, across, page and more).
text: text, with bold, italic, size, colour. Place it as move does (below: 's3'), or give arrow (a7) with side (above, below) to make it that arrow's conditions. id replaces a caption's text.
arrow: kind (reaction, equilibrium, curved, fishhook, line and more), from and to (each an id or [x, y]). help of arrow says how to add a step to a scheme.
shape: kind (${values("shape", "kind")}), around (ids) or box [x0, y0, x1, y1].
select: ids, for advanced run_command.
draw: kind, and its arguments as draw takes them.` }, ...REPLY }, ["operations"]);
const READ_IN = obj({ ...opOf("file").inputSchema.properties, ...opOf("read").inputSchema.properties });
const ADVANCED_IN = obj({ tool: pick([...ADVANCED, "help"]), args: { type: "object", properties: {}, additionalProperties: true, description: "As that tool takes them" }, ...REPLY }, ["tool"]);
const DRAWINGS_IN = obj({ action: pick(["list", "use", "new"], undefined, { default: "list" }), drawing: str(40, "use: an id that list gave"), for: pick(PURPOSES, "new: quick when not given"), text: { ...str(1_000_000), unlisted: true } }, ["action"]);
const TOOLS: Tool[] = [
  {
    name: "draw", title: "Draw", ops: KINDS, defs: { compound: LISTED_COMPOUND, side: SIDE },
    description: "Draws new work in one call and one undo step. Octet lays it out, below what is drawn unless you place it. kind is structures (a numbered grid), cycle (intermediates round a circle, centre text and steps) or figure (panels of rows of items). A reaction or scheme is draw_route's. Place it with at and anchor, or beside ids with gap and align. advanced help of a kind gives the rest (turning a compound to match a picture, a molecule atom by atom, a figure's items).",
    inputSchema: obj({
      // (A reaction is listed as draw_route's, and is still taken here.)
      kind: pick(KINDS.filter((k) => k !== "reaction")),
      structures: COMPOUNDS, columns: int(1, 20),
      steps: { ...list(obj({ step: int(0, 11), name: str(MAX_TEXT), in: str(MAX_TEXT), out: str(MAX_TEXT) }), 12), description: "A cycle's: step k (from 0) runs from intermediate k to the next, with a short name (OA, TM, RE), in and out" },
      intermediates: COMPOUNDS, centre: str(MAX_TEXT), anticlockwise: yes(),
      panels: { ...list(obj({ frame: pick(["none", "line", "fill"]), rows: list(list({ type: "object", properties: {}, additionalProperties: true }, 8), 6) }), 8), description: "A figure's: title, subtitle, rows of items, each a compound with structure for text (and brackets and more), or text" },
      number_under_caption: yes(), colour_by_element: yes(), element_colours: { type: "object", properties: {}, additionalProperties: true }, width: num(5, 300),
      ...placing("at", { $ref: "#/$defs/side" }), ...REPLY,
    }, ["kind"]),
    route: (a, notes) => wrongWith(KIND, a, notes) ?? (({ kind, ...args }) => ({ op: kind, args }))(a),
  },
  {
    name: "change", title: "Change the drawing", ops: [...BATCHABLE, "batch"],
    description: `Changes the drawing with a list of operations, done in order as one undo step. If one fails, none is kept. Ids come from results and from read: a structure is s3 or its compound number, an atom s3.2 (the second atom as you gave it), a bond s3.1-2, text t5, an arrow a7, a shape b2, a cycle c1. An operation can name what an earlier one made: '$1.s[0]' is the first structure of operation 1 ('$1.t[0]' its first text, and so on; '$1.made' all it made). advanced help of an op gives all its arguments.`,
    inputSchema: OPERATIONS,
    route: (a, notes) => {
      const wrong = wrongWith(OPERATIONS, a, notes);
      if (wrong) return wrong;
      // A draw is its kind's operation. One operation is run as itself, so its result is as its own call's.
      const { operations, ...reply } = a, steps: { tool: string; args: any }[] = [];
      for (const [k, { op, ...args }] of (operations as any[]).entries()) {
        const no = op === "draw" ? wrongWith(KIND, args, notes, `operations[${k}]`) : undefined;
        if (no) return no;
        const { kind, ...rest } = args;
        steps.push(op === "draw" ? { tool: kind, args: rest } : { tool: op, args });
      }
      return steps.length > 1 ? { op: "batch", args: { steps, ...reply } } : { op: steps[0].tool, args: { ...steps[0].args, ...reply }, at: "operations[0]" };
    },
  },
  {
    name: "read", title: "Read the drawing", ops: ["read", "file"],
    description: "Reads the drawing as a summary: structures (id, number, caption, formula), reactions (the route by compound number or id, '1 + s4 -> 2 -> 3', and each arrow's conditions), cycles, free text, Octet's warnings and its layout check. smiles adds each SMILES. detail: full reads everything: each structure's SMILES, InChI, name and box (bond lengths, y up), and every caption's box. ids reads only those. format gives the drawing (or ids) as a file (mol V3000, mol2000 V2000, cdx base64; pdf, png: help of file). Nothing is saved.",
    inputSchema: READ_IN,
    route: (a) => { const op = "format" in a ? "file" : "read"; return stray(a, READ_IN, op, "format") || { op, args: a }; },
  },
  {
    name: "drawings", title: "Octet's drawings", ops: ["list", "use", "new"],
    description: "Octet's open drawings. list: each one's id, title and unsaved changes, and the one this session uses. use: this session's calls go to drawing. new: a new drawing for a purpose (experiment: a page with a reagent table), in a new window when this one has work in it; later calls go to it.",
    inputSchema: DRAWINGS_IN,
    route: (a, notes) => wrongWith(DRAWINGS_IN, a, notes) ?? (({ action, ...args }) => ({ op: action, args }))(a),
  },
  {
    name: "advanced", title: "Other tools, and help", ops: [...ADVANCED, "help"],
    description: `Octet's other tools, each with its args. run_command {command, ids}: any menu command or Actions panel action, on the ids or the selection: clean_up, clean_reaction, undo, scale.120 and the rest, which help lists. set_style {preset, page, landscape, page_size [w, h] in mm}: the style or page alone (set_brief sets both). export {format}: Octet's Export dialog (pdf, png, svg and more), for the user to save. place_template {name, set, on}: a library template (ATP, ferrocene, Round-bottom flask). add_file {text}: a drawing from file text (CDXML, MOL, SMILES and more). fill_experiment {details, amounts}: an experiment page's details and reagent table. help {of}: the description and schema of one of these, a kind of draw or an op of change.`,
    inputSchema: ADVANCED_IN,
    route: (a, notes) => wrongWith(ADVANCED_IN, a, notes) ?? (({ tool, args, ...reply }) => stray(reply, ADVANCED_IN, tool, tool) || { op: tool, args: { ...args, ...reply }, at: "args" })(a),
  },
  {
    name: "set_brief", title: "Set the brief", ops: ["brief"],
    description: "The user's answers to the three questions in the instructions. A scheme, route, figure, cycle or grid waits for it. Octet sets the style and page, keeps it for the session and says what will not fit. No preference: kind quick. Call again to change it.",
    inputSchema: BRIEF_IN,
    route: (a) => ({ op: "brief", args: a }),
  },
  {
    name: "draw_route", title: "Draw a reaction or route", ops: ["route"],
    description: "A reaction, scheme or whole synthesis in one call and one undo step. Each scheme: title ('Scheme 1. The aldehyde 7'), start, then steps; Octet wraps it to the brief's page in even rows. Numbers run across schemes: a compound that ends one and starts the next is {from: '7'} there, with its number. A product with changes and no from is from the one before. legend letters puts a, b, c on the arrows and the conditions in a note under the scheme. A branch is a scheme of its own, from the compound it shares. A compound is as draw takes it.",
    inputSchema: obj({
      title: str(MAX_TEXT),
      schemes: list(obj({ title: str(MAX_TEXT), start: ROUTE_COMPOUNDS, steps: { ...list(obj({ products: ROUTE_COMPOUNDS, arrow: pick(ARROWS), reagents: TEXTS, catalysts: TEXTS, solvents: TEXTS, temperature: str(60), time: str(60), atmosphere: str(40), yield: str(40), above: TEXTS, below: TEXTS, label: str(40) }, ["products"]), 20), description: "Each: products, and conditions as data (reagents and catalysts over the arrow; solvents, temperature, time, atmosphere and yield under it); above and below add one free line or compound each; label, its letters ('a, b')" } }, ["start", "steps"]), 10),
      legend: pick(["none", "letters"]), keep_orientation: { type: "boolean", unlisted: true }, ...REPLY,
    }, ["schemes"]),
    route: (a) => ({ op: "route", args: a }),
  },
];

const INSTRUCTIONS = `Octet Draw is the chemical drawing app open on the user's computer. These tools draw in the user's open drawing with Octet's own commands, and read it back.
- Before you draw a scheme, route, figure, cycle or grid, ask the user these three questions, then call set_brief with the answers: ${QUESTIONS} With no preference, the destination is quick. One structure needs no brief.
- Work in few calls: each call costs the user a wait. Plan the whole drawing first, then draw it in one call: draw_route for a reaction, scheme or route, and draw with kind cycle for a catalytic cycle, structures for a grid, figure for a figure of panels. Make all your fixes in one change.
- Give Octet names (IUPAC, common and trade names, abbreviations such as TREN or dppf) or SMILES. Write a compound that is an earlier one with a change as from and changes. For a generic group (R, Ar, L) or a metal's ligands give a SMILES with * and labels ('*c1ccccc1', ['Ar']; '*[Pd]*', ['PPh3', 'PPh3']).
- In a reaction, put a co-reactant in start (Octet draws the +) or over the arrow, as the source does ('structure: Boc2O' in above draws it). Amounts go in that text ('Et3N (1.5 equiv)') or a caption. An experiment page's reagent table takes them through advanced fill_experiment.
- Trust Octet's layout. Every result of draw and change gives the ids and boxes of what it made (s structures, t text and each +, a arrows, b shapes, c cycles; a number, conditions and a cycle's text have no id there and move with what they belong to; g5 is a5's reagent table), Octet's new warnings, and check: "clean" when nothing in the drawing overlaps, runs off the page, lies on a bond or across a shape's edge, and no two labels meet; else the ids. Fix every id it names: none is a near miss to leave. Place the next thing by the boxes (right_of, below, at), with no read in between. detail: 'full' on any write call adds all it changed, with boxes.
- Clean means no boxes meet. It does not mean the drawing reads well, so for a figure, or to match a picture, look at it before you say it is done: read with picture and the ids of each part (a whole page in one picture is too small to show a crowded label). picture: true on a write shows only what changed. A chemistry question needs no picture.
- To highlight an atom, a bond, a group or a structure, use change's edit with highlight (Octet's Highlight), or ring_fill for a ring. Never draw an oval, box or dot for a highlight: a shape is a frame or a panel.
- Colour only what the user asks to colour. Keep the default black unless they name colours.
- Each call is one undo step. Never delete what the user drew unless they ask.
- advanced help gives every argument of a kind of draw, an operation of change or an advanced tool.`;

// ---- What each tool does ----

// Octet's name and formula for a structure, kept by its SMILES: naming a structure takes tens of ms, and a drawing
// is read again and again (2,000 kept).
const known = new Map<string, { name?: string; formula?: string; inchi?: string; key?: string }>();
function about(host: Host, m: Mol): { name?: string; formula?: string; smiles?: string; inchi?: string; key?: string } {
  const smiles = host.smiles(m), had = smiles ? known.get(smiles) : undefined;
  if (had) return { ...had, smiles };
  const got = { name: host.name(m), formula: host.formula(m), ...host.inchi(m) };
  if (smiles) { if (known.size >= 2000) known.clear(); known.set(smiles, got); }
  return { ...got, smiles };
}

const PAD = 3; // bond lengths between what is drawn and what an AI app adds below it
// The box of everything drawn, as drawn (drawing units, y up), or undefined: the structures with their labels, each
// text (a number under a structure and an arrow's conditions too), the arrows, the cycles, the reagent tables and the
// shapes. Not an experiment page's shapes: they are the boxes under its headings, and its schemes and text go in them.
function drawnBox(host: Host, m: Mol): Box | undefined {
  const cycles = (m.cycles ?? []).map((c): Box => [c.centre[0] - c.radius, c.centre[1] - c.radius, c.centre[0] + c.radius, c.centre[1] + c.radius]);
  const shapes = host.experiment() ? [] : (m.shapes ?? []).map((x) => corners([x.from, x.to]));
  return union([host.ink(m.atoms.map((_, i) => i)), ...(m.captions ?? []).map((c) => host.textBox(c.id)), ...(m.arrows ?? []).map(arrowBox), ...cycles, ...host.tables().map((t) => t.box), ...shapes].filter((b): b is Box => !!b));
}
// Where new work starts: its top left, clear under everything drawn, or at the top left of an empty page.
function origin(host: Host, m: Mol): P {
  const s = host.style(), [w, h] = pageSize(s), k = 72 / 25.4 / s.bond;
  // On an experiment page with nothing drawn yet: under the details at the top, at the left margin (15 mm), 80 mm down.
  if (host.experiment() && !m.atoms.length && !m.arrows?.length) return [(15 - w / 2) * k, (h / 2 - 80) * k];
  const b = drawnBox(host, m);
  if (b) return [b[0], b[1] - PAD];
  // On an empty page: at its left and top margins (15 mm), so that a scheme has the whole page under it. Where the
  // page's edges do not show (Quick start), level with the middle of the view.
  return [leftMargin(s), s.edges ? (h / 2 - 15) * k : host.centre()[1] + 2];
}
const boxOf = (m: Mol): Box => {
  const xs = m.atoms.map((a) => a.location[0]), ys = m.atoms.map((a) => a.location[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
};

type Read = { mol: Mol; text: string; number?: string; caption?: string; named?: boolean; note?: string }; // note: what its changes did to its stereocentres
type RunIn = { text: string; bold?: boolean; italic?: boolean; underline?: boolean; colour?: string; script?: "sub" | "super" };
type MoleculeIn = { atoms: { label?: string; runs?: RunIn[]; x: number; y: number; charge?: number; colour?: string }[]; bonds?: { from: number; to: number; kind?: string; colour?: string }[] };
// aside: a structure drawn over an arrow, which from: "previous" passes over.
type CompoundIn = { text?: string; molecule?: MoleculeIn; labels?: string[]; from?: string; changes?: Change[]; number?: string; caption?: string; like?: string; aside?: true } & Orient;
// A structure turned to lie as one already drawn (like: s3), by the atoms they share: the two mapped as one reaction
// step (Map Reaction Atoms), then the new one turned, or turned over, about its own middle (Augmented Clean Up
// Reaction's turn, interpret.ts alignByMap). Unchanged when they share too few atoms to map.
function likeOf(host: Host, ref: Mol, mol: Mol): Mol {
  const r = insertMol(ref, { ...mol, style: undefined }), steps = [{ reactants: [ref.atoms.map((_, i) => i)], products: [[...r.atoms]] }];
  const mapped = mapScheme(r.mol, steps, host.map, (atoms) => pickPart(r.mol, atoms));
  if (!mapped) return mol;
  return pickPart(clearScheme(alignByMap(mapped, steps), r.atoms), [...r.atoms]);
}
// Each compound read; the texts Octet cannot read (failed); and what is wrong with the rest (wrong: a molecule with a
// bond to no atom, labels that do not fit the *s).
async function read(host: Host, items: CompoundIn[], ctx?: Ctx): Promise<{ ok: Read[]; failed: string[]; wrong: string[] }> {
  await host.ready();
  const ok: Read[] = [], failed: string[] = [], wrong: string[] = [];
  let last: Read | undefined; // the compound before this one, when Octet read it
  const add = (r: Read, it: CompoundIn) => { ok.push(r); if (!it.aside) last = r; };
  for (const [k, it] of items.entries()) {
    if (ctx && items.length > 10 && k % 10 === 0) { await ctx.check(); ctx.progress(k, items.length, `Reading ${k + 1} of ${items.length}`); await host.settle(); }
    const number = it.number ? clean(it.number) : undefined, caption = it.caption ? clean(it.caption, true) : undefined, before = last;
    if (!it.aside) last = undefined;
    const like = it.like ? structureOf(host.doc(), it.like, host) : undefined;
    if (it.like && !like) { wrong.push(`like: there is no structure ${it.like.slice(0, 40)} in the drawing.`); continue; }
    const asLike = (mol: Mol) => (like ? likeOf(host, pickPart(host.doc(), like), mol) : mol);
    // An earlier compound with changes (compound.ts): the one before it in this call, one of this call by its number,
    // or a structure of the drawing by its id, number or name. It lies as that one does.
    if (it.from !== undefined || it.changes) {
      // An earlier compound by its name, for from and for a join's with (key says which, in a refusal).
      const earlier = (name: string, key: string): Mol | string => {
        const doc = host.doc(), numbered = (doc.captions ?? []).filter((c) => c.bold && c.under?.length && c.text.trim() === name);
        // Of this call: the last with that number. Two compounds of the call with one number are two readings (one
        // compound drawn twice is not).
        const mine = name === "previous" ? [] : ok.filter((r) => r.number === name), here = name === "previous" ? before : mine[mine.length - 1];
        const two = mine.some((r) => r.mol !== here!.mol && about(host, r.mol).key !== about(host, here!.mol).key);
        const one = here || numbered.length > 1 || name === "previous" ? undefined : structureOf(doc, name, host);
        // A compound's number is under every part of it (a salt's ions): from by number is all of them.
        const under = one && numbered.length ? new Set(numbered[0].under) : undefined, atoms = under ? structuresOf(doc).filter((s) => s.atoms.some((i) => under.has(i))).flatMap((s) => s.atoms) : one;
        return two ? `${key}: ${mine.length} compounds of this call have the number ${name}, and they are not one compound: give each its own number.`
          : here ? here.mol
          : numbered.length > 1 ? `${key}: ${numbered.length} structures have the number ${name} (${numbered.map((c) => sid(doc, c.under!)).join(", ")}): give the id of one.`
          : atoms ? pickAtoms(doc, atoms)
          : name === "previous" ? `${key}: there is no compound before this one in the call that Octet can read.` : `${key}: there is no compound ${name.slice(0, 40)} earlier in this call or in the drawing.`;
      };
      const name = clean(it.from ?? ""), source = it.text !== undefined || it.molecule || it.labels?.length ? "Give a compound as text, as a molecule, or as from with changes: one of them."
        : it.from === undefined ? "changes: give from too, the compound they change (its number, its id, or previous)." : earlier(name, "from");
      const made = typeof source === "string" ? source : change(source, it.changes ?? [], (with_) => earlier(clean(with_), "with"));
      const turned = typeof made === "string" || !hinted(it) ? made : orient(made.mol, it);
      if (typeof made === "string" || typeof turned === "string") wrong.push(`Compound ${number ?? k + 1}: ${typeof made === "string" ? made : `${turned}.`}`);
      else add({ mol: asLike("mol" in turned ? turned.mol : turned), text: `from ${name}`, number, caption, ...(made.notes.length ? { note: made.notes.join(" ") } : {}) }, it);
      continue;
    }
    if (it.molecule) {
      const mol = fromMolecule(it.molecule), turned = typeof mol === "string" || !hinted(it) ? mol : orient(mol, it);
      if (typeof turned === "string") wrong.push(typeof mol === "string" ? turned : `molecule: ${turned}.`); else add({ mol: asLike(turned), text: "a molecule given atom by atom", number, caption }, it);
      continue;
    }
    if (it.text === undefined) { wrong.push("Give each compound text (a name or SMILES), a molecule, or from with changes."); continue; }
    // Text of several lines (a MOL or SDF block, CDXML) keeps its lines and columns, as a file: only its control
    // characters go. A MOL file's first line is often blank, so it is not trimmed.
    // A SMILES's map numbers name its atoms for later changes: they are kept as tags, and not drawn.
    const text = it.text.trim().includes("\n") ? it.text.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "") : clean(it.text), got = host.structure(text), read = got && tagged(got);
    let mol = read && crowded(read) ? host.tidy(read) : read;
    if (!mol?.atoms.length) { failed.push(short(text, 60)); continue; }
    // A label for each * (a generic group), in the order they come in the SMILES: Octet keeps a SMILES's atom order.
    if (it.labels?.length) {
      const stars = mol.atoms.flatMap((x, i) => (x.label === "*" && !x.text ? [i] : []));
      if (stars.length !== it.labels.length) { wrong.push(`"${text.slice(0, 60)}" has ${stars.length} * but ${it.labels.length} labels were given.`); continue; }
      // Each stays a generic group (a * atom) with the label written on it: Ar is an aryl here, not argon.
      const at = new Map(stars.map((i, j) => [i, clean(it.labels![j])]));
      mol = { ...mol, atoms: mol.atoms.map((x, i) => (at.get(i) ? { ...x, text: at.get(i) } : x)) };
    }
    if (hinted(it)) {
      const turned = orient(mol, it);
      if (typeof turned === "string") { wrong.push(`"${text.slice(0, 60)}": ${turned}.`); continue; }
      mol = turned;
    }
    // A numbered atom written with no hydrogens ([C:7]) is read as SMILES has it, a radical: the reply says so.
    const bare = mol.atoms.flatMap((x) => (x.tag && x.radical ? [x.tag] : []));
    add({ mol: asLike(mol), text, number, caption, named: host.named(text), ...(bare.length ? { note: `As written, ${bare.map((t) => `atom ${t}`).join(" and ")} ${bare.length > 1 ? "are radicals" : "is a radical"}: a numbered atom needs its hydrogens ([CH2:${bare[0]}]).` } : {}) }, it);
  }
  return { ok, failed, wrong };
}
// Runs as Octet keeps them (TextRun): control characters out (spaces kept), each colour #rrggbb; or what is wrong.
function runsOf(r: RunIn[]): TextRun[] | string {
  const bad = r.find((x) => x.colour !== undefined && !COLOUR.test(x.colour));
  if (bad) return `colour: give #rrggbb, not ${bad.colour}`;
  const out = r.map((x): TextRun => ({ text: x.text.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ""), ...(x.bold ? { bold: true } : {}), ...(x.italic ? { italic: true } : {}), ...(x.underline ? { underline: true } : {}), ...(x.script ? { script: x.script } : {}), ...(x.colour ? { colour: x.colour } : {}) })).filter((x) => x.text);
  return out.length ? out : "runs: give some text";
}
const plain = (runs: TextRun[]) => runs.map((x) => x.text).join("");
// A structure given atom by atom (F4): each atom where it is given, with its label; each bond of the kind given (a
// wedge narrow at from). Nothing is laid out again.
function fromMolecule(x: MoleculeIn): Mol | string {
  const n = x.atoms.length, bonds = x.bonds ?? [], pairs = new Set<string>();
  for (const b of bonds) {
    if (b.kind !== undefined && !(b.kind in BONDS)) return `molecule: a bond's kind is one of ${Object.keys(BONDS).join(", ")}, not ${b.kind}.`;
    if (b.from >= n || b.to >= n || b.from === b.to) return `molecule: the bond from ${b.from} to ${b.to} needs two different atoms of the ${n} given (counting from 0).`;
    const key = `${Math.min(b.from, b.to)} ${Math.max(b.from, b.to)}`;
    if (pairs.has(key)) return `molecule: atoms ${b.from} and ${b.to} have two bonds: give one, with its kind (double, triple).`;
    pairs.add(key);
  }
  const colour = [...x.atoms.map((a) => a.colour), ...bonds.map((b) => b.colour)].find((c) => c !== undefined && !COLOUR.test(c));
  if (colour) return `molecule: colour is #rrggbb, not ${colour}.`;
  let m: Mol = { atoms: x.atoms.map((a) => ({ label: "C", location: [a.x, a.y, 0] as [number, number, number] })), bonds: bonds.map((b) => ({ type: 1, atoms: [b.from, b.to] as [number, number] })) };
  for (const [i, a] of x.atoms.entries()) {
    const runs = a.runs && runsOf(a.runs);
    if (typeof runs === "string") return `molecule: atom ${i}: ${runs}.`;
    const label = runs ? plain(runs) : clean(a.label ?? "");
    if (label) m = setLabel(m, i, label);
    // Runs keep their styles on a written label (an M with a superscript IV).
    if (runs && runs.some((r) => Object.keys(r).length > 1)) m = { ...m, atoms: m.atoms.map((y, k) => (k === i ? { ...y, text: label, runs } : y)) };
    if (a.charge || a.colour) m = { ...m, atoms: m.atoms.map((y, k) => (k === i ? { ...y, ...(a.charge ? { charge: a.charge } : {}), ...(a.colour ? { colour: a.colour } : {}) } : y)) };
  }
  for (const [k, b] of bonds.entries()) {
    if (b.kind && b.kind !== "single") m = setBondSpec(m, k, BONDS[b.kind as BondKind].spec);
    if (b.colour) m = { ...m, bonds: m.bonds.map((y, j) => (j === k ? { ...y, colour: b.colour } : y)) };
  }
  return m;
}
type Orient = { rotate?: number; flip?: "horizontal" | "vertical"; up?: string; down?: string; left?: string; right?: string; geometry?: Geometry; colours?: Record<string, unknown> };
const WAYS = { right: 0, up: 90, left: 180, down: 270 } as const;
const hinted = (o: Orient) => o.rotate !== undefined || !!o.flip || !!o.geometry || !!o.colours || (Object.keys(WAYS) as (keyof typeof WAYS)[]).some((w) => o[w] !== undefined);
// An atom an AI app names: #n (the n-th atom of the SMILES, from 0: Octet keeps its order), a label it gave (labels),
// or an element (the first such atom).
function atomNamed(m: Mol, name: string): number | undefined {
  const n = /^#(\d{1,4})$/.exec(name.trim());
  if (n) return Number(n[1]) < m.atoms.length ? Number(n[1]) : undefined;
  const i = m.atoms.findIndex((a) => a.text === name);
  if (i >= 0) return i;
  const j = m.atoms.findIndex((a) => !a.text && a.label === name);
  return j >= 0 ? j : undefined;
}
// Atoms turned about a point, anticlockwise.
function turnAbout(m: Mol, c: P, degrees: number): Mol {
  const r = (degrees * Math.PI) / 180, cos = Math.cos(r), sin = Math.sin(r);
  return { ...m, atoms: m.atoms.map((a) => { const x = a.location[0] - c[0], y = a.location[1] - c[1]; return { ...a, location: [c[0] + x * cos - y * sin, c[1] + x * sin + y * cos, a.location[2] ?? 0] as [number, number, number] }; }) };
}
// The structure turned, flipped and coloured as the hints say; or what is wrong with them.
function orient(m: Mol, o: Orient): Mol | string {
  let mol = m;
  const degree = mol.atoms.map(() => 0);
  for (const b of mol.bonds) { degree[b.atoms[0]]++; degree[b.atoms[1]]++; }
  const hub = degree.indexOf(Math.max(...degree)), at = (i: number): P => [mol.atoms[i].location[0], mol.atoms[i].location[1]];
  if (o.geometry) {
    const places = GEOMETRIES[o.geometry], ligands = mol.bonds.flatMap((b, k) => (b.atoms.includes(hub) ? [{ k, atom: b.atoms[0] === hub ? b.atoms[1] : b.atoms[0] }] : [])).sort((p, q) => p.atom - q.atom);
    if (ligands.length !== places.length) return `geometry ${o.geometry} takes ${places.length} bonds on the centre (the atom with the most bonds, #${hub}), which has ${ligands.length}`;
    // Each ligand: the atoms it reaches without passing the centre. A ring through the centre (a chelate) cannot turn.
    const parts = ligands.map(({ atom }) => {
      const seen = new Set([atom]), todo = [atom];
      while (todo.length) { const i = todo.pop()!; for (const b of mol.bonds) { const j = b.atoms[0] === i ? b.atoms[1] : b.atoms[1] === i ? b.atoms[0] : -1; if (j >= 0 && j !== hub && !seen.has(j)) { seen.add(j); todo.push(j); } } }
      return seen;
    });
    if (parts.some((p, i) => ligands.some((l, j) => j !== i && p.has(l.atom)))) return `geometry: a ring runs through the centre (a chelate), so its ligands cannot be placed one by one. Give a molecule with coordinates`;
    const c = at(hub);
    ligands.forEach(({ k, atom }, i) => {
      const [angle, stereo] = places[i], p = at(atom), turn = angle - (Math.atan2(p[1] - c[1], p[0] - c[0]) * 180) / Math.PI;
      // Turned to its place, and out to 1.5 bond lengths from the metal, so the labels round it have room.
      const r = (turn * Math.PI) / 180, cos = Math.cos(r), sin = Math.sin(r), out = 1.5 - Math.hypot(p[0] - c[0], p[1] - c[1]), u = [Math.cos((angle * Math.PI) / 180) * out, Math.sin((angle * Math.PI) / 180) * out];
      mol = { ...mol, atoms: mol.atoms.map((a, j) => { if (!parts[i].has(j)) return a; const x = a.location[0] - c[0], y = a.location[1] - c[1]; return { ...a, location: [c[0] + x * cos - y * sin + u[0], c[1] + x * sin + y * cos + u[1], a.location[2] ?? 0] as [number, number, number] }; }) };
      // Then turned about its donor atom so its bulk points out from the metal, away from the other ligands.
      const at0 = at(atom), rest = [...parts[i]].filter((j) => j !== atom);
      if (rest.length) {
        const g = rest.reduce<P>((t, j) => [t[0] + at(j)[0] / rest.length, t[1] + at(j)[1] / rest.length], [0, 0]);
        const t2 = (angle * Math.PI) / 180 - Math.atan2(g[1] - at0[1], g[0] - at0[0]), c2 = Math.cos(t2), s2 = Math.sin(t2);
        mol = { ...mol, atoms: mol.atoms.map((a, j) => { if (j === atom || !parts[i].has(j)) return a; const x = a.location[0] - at0[0], y = a.location[1] - at0[1]; return { ...a, location: [at0[0] + x * c2 - y * s2, at0[1] + x * s2 + y * c2, a.location[2] ?? 0] as [number, number, number] }; }) };
      }
      mol = { ...mol, bonds: mol.bonds.map((b, j) => (j === k ? { ...b, atoms: [hub, atom] as [number, number], type: 1, stereo: stereo || undefined, display: undefined } : b)) };
    });
  }
  // The middle the hints turn about: the centre when it has four or more bonds (a metal); else the middle of the
  // rings (the atoms left when every chain end is pruned away), so a substituent named up points straight out from
  // its ring, as a chemist reads it; else the middle of the atoms.
  const xs = mol.atoms.map((a) => a.location[0]), ys = mol.atoms.map((a) => a.location[1]);
  const core = (() => {
    const left = new Set(mol.atoms.map((_, i) => i)), deg = [...degree];
    for (let again = true; again;) { again = false; for (const i of left) if (deg[i] <= 1) { left.delete(i); again = true; for (const b of mol.bonds) if (b.atoms.includes(i)) deg[b.atoms[0] === i ? b.atoms[1] : b.atoms[0]]--; } }
    return [...left];
  })();
  const c: P = degree[hub] >= 4 ? at(hub) : core.length >= 3 ? [core.reduce((t, i) => t + at(i)[0], 0) / core.length, core.reduce((t, i) => t + at(i)[1], 0) / core.length] : [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
  const ways = (Object.keys(WAYS) as (keyof typeof WAYS)[]).filter((w) => o[w] !== undefined);
  if (ways.length > 2) return "give at most two of up, down, left and right";
  const find = (w: keyof typeof WAYS) => atomNamed(mol, o[w]!);
  for (const w of ways) if (find(w) === undefined) return `${w}: there is no atom ${o[w]!.slice(0, 40)} (give a label from labels, an element, or #n for the n-th atom of the SMILES, from 0)`;
  if (ways.length) {
    const [w1, w2] = ways, a1 = find(w1)!, p = at(a1);
    if (Math.hypot(p[0] - c[0], p[1] - c[1]) < 1e-6) return `${w1}: ${o[w1]} is the middle of the structure: name an atom out from it`;
    // Rounded to 30° so rings keep the look of Octet's ring templates (rotate gives an exact angle).
    mol = turnAbout(mol, c, Math.round((WAYS[w1] - (Math.atan2(p[1] - c[1], p[0] - c[0]) * 180) / Math.PI) / 30) * 30);
    if (w2) {
      const k = w2 === "left" || w2 === "right" ? 0 : 1;
      if (k === (w1 === "left" || w1 === "right" ? 0 : 1)) return `${w1} and ${w2} are one line: give the second across the first (up with left or right)`;
      const q = at(find(w2)!), side = q[k] - c[k], want = w2 === "right" || w2 === "up" ? 1 : -1;
      // The wrong way round: turned over on the line through the middle, keeping each stereocentre (as Flip does).
      if (side * want < -1e-6) mol = flipAtoms(mol, new Set(mol.atoms.map((_, i) => i)), k === 0 ? "horizontal" : "vertical", false, c[k]);
    }
  }
  if (o.rotate) mol = turnAbout(mol, c, o.rotate);
  if (o.flip) mol = flipAtoms(mol, new Set(mol.atoms.map((_, i) => i)), o.flip, false);
  if (o.colours) {
    const pairs = Object.entries(o.colours);
    if (pairs.length > 40) return "colours: at most 40";
    for (const [key, colour] of pairs) {
      if (typeof colour !== "string" || !COLOUR.test(colour)) return `colours: ${key.slice(0, 40)} takes #rrggbb, not ${String(colour).slice(0, 20)}`;
      const hit = mol.atoms.map((a, i) => (a.text === key || (!a.text && a.label === key) ? i : -1)).filter((i) => i >= 0);
      if (!hit.length) return `colours: there is no atom ${key.slice(0, 40)}`;
      mol = { ...mol, atoms: mol.atoms.map((a, i) => (hit.includes(i) ? { ...a, colour } : a)) };
    }
  }
  return mol;
}
// Two atoms not bonded to each other closer than half a bond length: Indigo's layout of some SMILES (two PPh3 on a
// metal) puts rings on top of each other, so Octet's Clean Up Structure lays it out again.
function crowded(m: Mol): boolean {
  if (m.atoms.length > 300) return false;
  const bonded = new Set(m.bonds.map((b) => `${Math.min(...b.atoms)} ${Math.max(...b.atoms)}`));
  return m.atoms.some((a, i) => m.atoms.some((b, j) => j > i && !bonded.has(`${i} ${j}`) && Math.hypot(a.location[0] - b.location[0], a.location[1] - b.location[1]) < 0.5));
}
// A structure added with its left, middle at `at`; its atoms, and the drawing.
// Each structure a tool drew: the text it was drawn from, and whether Name to Structure read it as a name (3d). By the
// structure's key, for this window.
const sources = new Map<number, { given: string; named: boolean }>();
// over: text that goes under the structure before its number (a figure's number_under_caption): Octet stacks a
// structure's text under it in the order it was added.
function place(m: Mol, s: Read, left: number, middle: number, over?: Omit<Caption, "id">): { mol: Mol; atoms: number[]; width: number; number?: number; over?: number } {
  const b = boxOf(s.mol), r = insertMol(m, { ...s.mol, style: undefined }, [left - b[0], middle - (b[1] + b[3]) / 2]);
  let mol = r.mol;
  const atoms = [...r.atoms], key = ++lastKey;
  for (const i of atoms) mol.atoms[i].key = key;
  sources.set(key, { given: short(s.text, 200), named: !!s.named });
  let number: number | undefined, first: number | undefined;
  if (over) [mol, first] = addCaption(mol, { ...over, under: atoms });
  if (s.number) [mol, number] = addCaption(mol, { text: s.number, x: 0, y: 0, bold: true, under: atoms });
  if (s.caption) mol = addCaption(mol, { text: s.caption, x: 0, y: 0, under: atoms })[0];
  return { mol, atoms, width: b[2] - b[0], number, over: first };
}
// The names Octet read as another name (decision 0021, misread names): each name given, with the formula and Octet's
// own name for what it drew, so a name read another way shows at once. With each compound's note, they are all a
// result's sentence says of its compounds (R6): a SMILES or a file is drawn as given, so it has no name to check, and
// naming it takes time.
const plainName = (t: string) => t.toLowerCase().replace(/[\s\-,()[\]']/g, "");
function readAs(host: Host, list: Read[]): string {
  const odd = list.flatMap((s) => {
    if (!s.named) return [];
    const { name: own, formula } = about(host, s.mol);
    return own && plainName(own) !== plainName(s.text) ? [`${short(s.text, 80)} (${formula}; Octet's name: ${short(own, 120)})`] : [];
  });
  // What a compound's changes did, and what Octet read in a way the AI app may not mean (a numbered atom with no
  // hydrogens), each with how the compound was given and its number.
  const notes = list.flatMap((s) => (s.note ? [`${short(s.text, 40)}${s.number ? ` (${s.number})` : ""} [${s.note}]`] : []));
  return `${odd.length ? ` Octet read the names as: ${odd.slice(0, 12).join(", ")}${odd.length > 12 ? `, and ${odd.length - 12} more (detail: full gives each)` : ""}.` : ""}${notes.length ? ` Octet notes: ${notes.join(", ")}.` : ""}`;
}
// Octet's reading of each name given (D9).
const names = (host: Host, list: Read[]) => list.map((x) => { const { name: own, formula } = about(host, x.mol); return { given: short(x.text, 80), ...(own ? { octet: own } : {}), ...(formula ? { formula } : {}) }; });
const failedNote = (failed: string[], wrong: string[] = []) => `${failed.length ? ` Octet cannot read ${failed.map((f) => `"${f}"`).join(", ")}: give a SMILES instead (with * for a generic group such as L or R, and its labels).${failed.some((f) => /\b(?:endo|exo|syn|anti)\b/i.test(f)) ? " Octet's names do not take endo, exo, syn or anti: give an isomeric SMILES (@ and @@)." : ""}` : ""}${wrong.map((w) => ` ${w}`).join("")}`;
const UNDO = " One undo step.";

async function drawStructures(host: Host, a: { structures: { text: string; number?: string }[]; columns?: number } & Placement, ctx: Ctx): Promise<Result> {
  const { ok, failed, wrong } = await read(host, a.structures, ctx);
  if (wrong.length) return { text: `Octet drew nothing.${failedNote(failed, wrong)}`, error: true };
  // A cancel that came while Octet read the names stops the call before it draws.
  if (a.structures.length > 10) { await host.settle(); await ctx.check(); }
  if (!ok.length) return { text: `Octet drew nothing.${failedNote(failed)}`, error: true };
  // The cells from the atoms: as wide and as tall as the largest structure, with room between. The columns: as given;
  // else one row for 6 or fewer and a block for more. On a page, no more than fit inside its margins: then the fewest
  // rows that hold them all, as even as they can be (6 where 5 fit are two rows of 3).
  const sizes = ok.map((s) => boxOf(s.mol)), cell: P = [Math.max(...sizes.map((b) => b[2] - b[0])) + 2, Math.max(...sizes.map((b) => b[3] - b[1])) + 2.5];
  const st = host.style(), paged = st.edges && !host.experiment(), inside = -2 * leftMargin(st), most = ok.length <= 6 ? ok.length : Math.ceil(Math.sqrt(ok.length * 1.6));
  const fit = (row: number, step: number) => Math.max(1, Math.floor((inside - row) / step + 1e-6) + 1);
  const columns = (fitting: number) => a.columns ?? (!paged || fitting >= most ? most : Math.ceil(ok.length / Math.ceil(ok.length / fitting))), drawn = columns(fit(cell[0] - 2, cell[0]));
  let m = host.doc();
  const [x0, y0] = origin(host, m), laid: number[][] = [];
  ok.forEach((s, k) => {
    const b = sizes[k], [col, row] = [k % drawn, Math.floor(k / drawn)], r = place(m, s, x0 + col * cell[0] + (cell[0] - 2 - (b[2] - b[0])) / 2, y0 - row * cell[1] - cell[1] / 2);
    m = r.mol; laid.push(r.atoms);
    if (k === ok.length - 1 || (ok.length <= 30 && k % drawn === drawn - 1)) m = host.set(m); // a small grid is drawn a row at a time
  });
  await host.settle();
  // Then the grid is spaced from each structure's box as drawn, with its labels, number and caption (about its cell's
  // middle): a label can reach past its atoms, and a caption can be wider than its structure or deeper than the room a
  // cell leaves under one. A bond length between neighbours, and the grid starts where the first column's text starts.
  // The columns are counted again from those boxes.
  m = host.doc();
  const full = laid.map((atoms) => boxOfIds(host, m, [sid(m, atoms)!])!), middle = (k: number, n: number, w: number, h: number): P => [x0 + (k % n) * w + cell[0] / 2 - 1, y0 - Math.floor(k / n) * h - cell[1] / 2];
  // (Each structure's reach from its cell's middle: left, right, up and down.)
  const reaches = full.map((b, k) => { const p = middle(k, drawn, ...cell); return [p[0] - b[0], b[2] - p[0], b[3] - p[1], p[1] - b[1]]; }), reach = (way: number, of = reaches) => Math.max(...of.map((v) => v[way]));
  const left = reach(0), right = reach(1), down = reach(3), w = Math.max(cell[0], left + right + 1), h = Math.max(cell[1], reach(2) + down + 1);
  const fits = fit(left + right, w), cols = columns(fits), rows = Math.ceil(ok.length / cols), over = Math.max(0, reach(0, reaches.filter((_, k) => k % cols === 0)) - (cell[0] / 2 - 1));
  // The grid's box across the page, and how far it moves to lie on the page (as a scheme does).
  const ends = reaches.map((v, k) => { const x = middle(k, cols, w, h)[0] + over; return [x - v[0], x + v[1]]; }), start = Math.min(...ends.map((e) => e[0])), wide = Math.max(...ends.map((e) => e[1])) - start;
  const dx = paged && !placed(a) ? across(st, [start, 0, start + wide, 0]) : 0;
  if (cols !== drawn || w > cell[0] || h > cell[1] || over || dx) {
    laid.forEach((atoms, k) => { const p = middle(k, drawn, ...cell), q = middle(k, cols, w, h); m = shift(m, new Set(atoms), new Set(), [q[0] + over + dx - p[0], q[1] - p[1]]); });
    host.set(m);
    await host.settle();
  }
  // What does not fit the page, said in the reply with what the AI app can do (the layout check names the ids): rows
  // wider than the page, and rows past its bottom edge (deep: the rows that are on the page).
  const r1 = (v: number) => Math.round(v * 10) / 10, ph = pageSize(st)[1], k = 72 / 25.4 / st.bond, deep = Math.max(0, Math.floor((y0 - cell[1] / 2 - down + (ph / 2) * k) / h + 1e-6) + 1);
  const advice = !paged || placed(a) ? "" : `${wide > inside + 1e-6 ? ` A row of ${cols} is ${r1(wide)} bond lengths wide (the page has ${r1(inside)}): give ${fits >= cols ? "" : `columns: ${fits}, or `}a larger page (set_brief).` : ""}${rows > deep ? ` ${rows - deep} of the ${rows} rows ${rows - deep > 1 ? "are" : "is"} past the bottom of the page: draw ${deep ? `the structures after the first ${deep * cols}` : "them"} in a new drawing, or give a larger page (set_brief).` : ""}`;
  return { text: `Drew ${ok.length} structure${ok.length > 1 ? "s" : ""} in ${rows} row${rows > 1 ? "s" : ""} of ${Math.min(cols, ok.length)}.${advice}${readAs(host, ok)}${failedNote(failed)}${UNDO}`, extra: () => ({ names: names(host, ok) }) };
}

// label: a route's letters for the step ('a, b'), its first line over the arrow.
type StepIn = StepFacts & { arrow?: ArrowKind; above?: (string | CompoundIn)[]; below?: (string | CompoundIn)[]; products: CompoundIn[]; label?: string };
// A line over or under an arrow: text, with what it says where it was given as data (3b); or a compound drawn there
// (as text that starts "structure:" is).
type Line = [string | CompoundIn, StepFacts?];
const structured = (t: Line[0]) => typeof t !== "string" || /^structure:/i.test(t);
const textLines = (items: Line[0][]) => items.filter((t): t is string => !structured(t));
// The most characters on a line of conditions that can break: an arrow as long as its text is then at most about a
// third of an A4 page. Items go on as few lines as hold them; an item longer than that has a line of its own.
const WIDE = 30;
const packed = (items: string[], join = ", ") => items.reduce<string[][]>((lines, t) => { const l = lines[lines.length - 1]; if (l && [...l, t].join(join).length <= WIDE) l.push(t); else lines.push([t]); return lines; }, []);
// A step's conditions as lines over and under its arrow: reagents, then catalysts, above; solvents with temperature,
// time and atmosphere, then the yield, below; the free lines after them. A list too long for one line goes on more,
// each line with its own items as data; a free line too long breaks after a comma or semicolon.
function stepLines(st: StepIn): { above: Line[]; below: Line[] } {
  const c = (t?: string) => (t ? clean(t) : ""), items = (l?: string[]) => (l ?? []).map((t) => c(t)).filter(Boolean);
  const reagents = items(st.reagents), catalysts = items(st.catalysts), solvents = items(st.solvents), [temperature, time, atmosphere, made] = [c(st.temperature), c(st.time), c(st.atmosphere), c(st.yield)];
  const lines = (k: "reagents" | "catalysts" | "solvents", l: string[]) => packed(l).map((x): Line => [x.join(", "), { [k]: x }]);
  const after: StepFacts = { ...(temperature ? { temperature } : {}), ...(time ? { time } : {}), ...(atmosphere ? { atmosphere } : {}) };
  // A long line (a solvent mixture with its temperature and time) goes on two or more: the solvents, then the rest.
  const line = [...solvents, temperature, time, atmosphere].filter(Boolean).join(", "), rest = [temperature, time, atmosphere].filter(Boolean).join(", ");
  const conditionLines: Line[] = solvents.length && line.length > WIDE ? [...lines("solvents", solvents), ...(rest ? [[rest, after] as Line] : [])] : line ? [[line, { ...(solvents.length ? { solvents } : {}), ...after }]] : [];
  const wrapped = (t: string) => (structured(t) ? t : t.split("\n").flatMap((l) => (l.length > WIDE ? packed(l.split(/(?<=[,;]) /), " ").map((x) => x.join(" ")) : [l])).join("\n"));
  const free = (l?: (string | CompoundIn)[]) => (l ?? []).map((t): Line => [typeof t === "string" ? wrapped(clean(t, true)) : t]).filter(([t]) => t);
  return { above: [...(c(st.label) ? [[c(st.label)] as Line] : []), ...lines("reagents", reagents), ...lines("catalysts", catalysts), ...free(st.above)], below: [...conditionLines, ...free(st.below), ...(made ? [[made, { yield: made }] as Line] : [])] };
}

// route: a scheme of a route (drawRoute), which gets the compounds Octet read and the scheme's box as drawn, and says
// what does not fit the page for all its schemes at once.
async function drawReaction(host: Host, a: { start: CompoundIn[]; steps: StepIn[]; keep_orientation?: boolean } & Placement, ctx: Ctx, route?: { ok: Read[]; boxes: Box[] }): Promise<Result> {
  // Every compound read first, so nothing is drawn when one of them cannot be.
  const lines = a.steps.map(stepLines);
  // In the order they are drawn: each step's structures over and under its arrow, then its products.
  const all = [...a.start, ...a.steps.flatMap((s, k) => [...[...lines[k].above, ...lines[k].below].map(([t]) => t).filter(structured).map((t): CompoundIn => ({ ...(typeof t === "string" ? { text: t.replace(/^structure:\s*/i, "") } : t), aside: true })), ...s.products])];
  const { ok, failed, wrong } = await read(host, all);
  if (failed.length || wrong.length) return { text: `Octet drew nothing.${failedNote(failed, wrong)}`, error: true };
  const next = (() => { let k = 0; return () => ok[k++]; })();
  let m = host.doc();
  // The row's line: under where new work starts by as far as the row can reach up (half its tallest structure, however
  // it is turned; an arrow's lines, about a bond length each, and structures over it). So the new row is read alone:
  // text within 3 bond lengths over an arrow's line reads as its conditions (a scheme's title, drawn before).
  const tall = Math.max(...ok.map((s) => { const b = boxOf(s.mol); return Math.hypot(b[2] - b[0], b[3] - b[1]); }));
  const was = m, [x0, top] = origin(host, m), up = Math.max(tall / 2, ...lines.map((l) => l.above.reduce((h, [t]) => h + (typeof t !== "string" || structured(t) ? tall : t.split("\n").length), 0)));
  const y = top - up, arrows = new Set<number>(), lem = host.style().labelSize / host.style().bond;
  let x = x0;
  // Each step's structures (their atoms), for the turn that lays each product as its starting material.
  const laid: { reactants: number[][]; products: number[][] }[] = [];
  let last: number[][] = [];
  const group = (n: number) => {
    const groups: number[][] = [];
    for (let k = 0; k < n; k++) {
      if (k) { m = addCaption(m, { text: "+", x: x + 0.6, y: y - 0.3 })[0]; x += 1.8; }
      const r = place(m, next(), x, y);
      m = r.mol; x += r.width + 1.5; groups.push(r.atoms);
    }
    last = groups;
  };
  group(a.start.length);
  for (const [k, st] of a.steps.entries()) {
    const reactants = last;
    await ctx.check();
    ctx.progress(k, a.steps.length, `Step ${k + 1} of ${a.steps.length}`);
    const facts = new Map([...lines[k].above, ...lines[k].below].filter(([, f]) => f) as [string, StepFacts][]);
    const above = lines[k].above.map(([t]) => t), below = lines[k].below.map(([t]) => t), longest = Math.max(0, ...textLines([...above, ...below]).map((t) => Math.max(...t.split("\n").map((l) => l.length)))) * 0.42;
    // The structures over and under the arrow, each with its box by its atoms and the room its longest label can take
    // either side. The arrow is as long as its text and as each side's structures in a row: Clean Up Reaction reads
    // as an arrow's conditions the structures that lie within its ends, and lays them out clear of its text.
    const beside = [above, below].map((items) => items.filter(structured).map(() => { const s = next(), b = boxOf(s.mol); return { s, b, pad: 0.3 + 0.6 * lem * Math.max(0, ...s.mol.atoms.map((x) => (x.text ?? (x.label === "C" ? "" : x.label)).length)) }; }));
    const rowOf = (l: (typeof beside)[number]) => l.reduce((w, v) => w + v.b[2] - v.b[0] + 2 * v.pad, 0) + 0.75 * Math.max(0, l.length - 1);
    const length = Math.max(3, longest + 1, ...beside.map((l) => (l.length ? rowOf(l) + 1 : 0)));
    const [mol, id] = addArrow(m, { kind: st.arrow ?? "reaction", from: [x, y], to: [x + length, y] });
    m = mol; arrows.add(id);
    for (const [j, side, items] of [[0, "above", above], [1, "below", below]] as const) {
      let at = x + length / 2 - rowOf(beside[j]) / 2;
      for (const { s, b, pad } of beside[j]) { const r = place(m, s, at + pad, y + (side === "above" ? 1 : -1) * (1.2 + (b[3] - b[1]) / 2)); m = r.mol; at += b[2] - b[0] + 2 * pad + 0.75; }
      // Octet stacks text kept on an arrow out from it, the first nearest: lines above go on from the bottom one up,
      // so they read top to bottom as listed.
      const lines = textLines(items);
      for (const t of side === "above" ? lines.reverse() : lines) m = addCaption(m, { text: t, x: x + length / 2, y, align: "centre", on: { arrow: id, side }, ...(facts.has(t) ? { facts: facts.get(t) } : {}) })[0];
    }
    x += length + 1.5;
    group(st.products.length);
    laid.push({ reactants, products: last });
    // Each product turned to lie as the reactant it shares most atoms with (Augmented Clean Up Reaction, as a chemist
    // copies a structure and changes a group), so the scheme reads the same way round throughout. The map that turns
    // it is taken off again.
    if (a.keep_orientation !== false && k === a.steps.length - 1) {
      const mapped = mapScheme(m, laid, host.map, (atoms) => pickPart(m, atoms));
      if (mapped) m = respaced(was, m, clearScheme(alignByMap(mapped, laid), new Set(laid.flatMap((s) => [...s.reactants, ...s.products].flat()))), laid.flatMap((s) => s.products));
    }
    // Drawn step by step only for a call that asked for progress: each set and settle costs a frame or more. The
    // step's products are placed first, so the last step's reach the window too.
    if (ctx.watched) { m = host.set(m); await host.settle(); }
  }
  // Clean Up Reaction, as ⇧⌘X on these arrows: spacing, levels, conditions, wrapping to the page.
  if (!ctx.watched) m = host.set(m);
  await host.settle();
  host.cleanReactions(arrows);
  await host.settle();
  // The scheme as laid out goes where new work starts: its top there, and across the page as `across` puts it. A
  // wrapped line is centred under the first, and a reagent table has its row names to the left of the reaction (B4).
  const now = host.doc(), old = new Set(was.captions?.map((c) => c.id)), atoms = now.atoms.map((_, i) => i).slice(was.atoms.length), texts = (now.captions ?? []).filter((c) => !old.has(c.id)).map((c) => c.id);
  const b = union([host.ink(atoms), ...texts.map((id) => host.textBox(id)), ...(now.arrows ?? []).filter((x) => arrows.has(x.id)).map(arrowBox), ...host.tables().filter((t) => arrows.has(t.arrow)).map((t) => t.box)].filter((v): v is Box => !!v));
  let advice = "";
  if (b && !placed(a)) {
    const st = host.style(), d: P = [across(st, b), top - b[3]];
    if (Math.hypot(...d) > 1e-6) { host.set(shift(now, new Set(atoms), new Set([...arrows, ...texts]), d)); await host.settle(); }
    const at: Box = [b[0] + d[0], b[1] + d[1], b[2] + d[0], b[3] + d[1]];
    if (route) route.boxes.push(at); else advice = unfit(host, [at]);
  }
  route?.ok.push(...ok);
  return { text: `Drew ${a.steps.length === 1 ? "the reaction" : `a scheme of ${a.steps.length} steps`}. Octet laid it out with Clean Up Reaction.${advice}${readAs(host, ok)}${UNDO}`, extra: () => ({ names: names(host, ok) }) };
}
// A product turned to lie as its starting material can come out narrower or wider than its place in the row (a chain
// turned upright leaves a gap wider than a reaction's), and then Clean Up Reaction cannot read the row whole, so cannot
// wrap it. Each product keeps its left edge, and what comes after it in the row moves as far as its width changed.
// was: the row as drawn before the turn; before: the drawing before the row, none of which moves.
function respaced(before: Mol, was: Mol, m: Mol, products: number[][]): Mol {
  const span = (mol: Mol, g: number[]) => { const xs = g.map((i) => mol.atoms[i].location[0]); return [Math.min(...xs), Math.max(...xs)]; };
  const old = highest(before), own = new Map<number, number>(), grew: [number, number][] = [];
  let by = 0;
  for (const g of [...products].sort((p, q) => span(was, p)[0] - span(was, q)[0])) {
    const [l0, r0] = span(was, g), [l1, r1] = span(m, g), d = r1 - l1 - (r0 - l0);
    for (const i of g) own.set(i, l0 + by - l1);
    grew.push([(l0 + r0) / 2, d]);
    by += d;
  }
  // (All at once: what the row drew past a product's middle moves as far as that product grew.)
  const dx = (x: number) => grew.reduce((t, [mid, d]) => (x > mid ? t + d : t), 0), far = (d: number) => Math.abs(d) > 1e-6;
  return {
    ...m,
    atoms: m.atoms.map((a, i) => { const d = i < before.atoms.length ? 0 : own.get(i) ?? dx(a.location[0]); return far(d) ? { ...a, location: [a.location[0] + d, a.location[1], a.location[2] ?? 0] } : a; }),
    arrows: m.arrows?.map((x) => { const d = x.id > old ? dx(Math.min(x.from[0], x.to[0])) : 0; return far(d) ? { ...x, from: [x.from[0] + d, x.from[1]], to: [x.to[0] + d, x.to[1]] } : x; }),
    captions: m.captions?.map((c) => { const d = c.id > old && !c.under && !c.on && !c.cycle ? dx(c.x) : 0; return far(d) ? { ...c, x: c.x + d } : c; }),
  };
}
// What of a scheme, or of a route's schemes (each its box as drawn, down to what goes under it), does not fit the
// page, said with what the AI app can do (plan 3.2): a line that cannot break, and the first scheme that runs past the
// bottom. Quick start has no page, and an experiment page has its own boxes.
function unfit(host: Host, boxes: Box[]): string {
  const st = host.style();
  if (!st.edges || host.experiment()) return "";
  const [pw, ph] = pageSize(st), k = 72 / 25.4 / st.bond, r1 = (v: number) => Math.round(v * 10) / 10, name = (j: number) => (boxes.length > 1 ? `Scheme ${j + 1}` : "The scheme");
  const wide = boxes.findIndex((b) => b[2] - b[0] > pw * k + 1e-6), deep = boxes.findIndex((b) => b[1] < (-ph / 2) * k - 1e-6);
  return `${wide < 0 ? "" : ` ${name(wide)} is ${r1(boxes[wide][2] - boxes[wide][0])} bond lengths wide (the page is ${r1(pw * k)}): give a larger page or landscape (set_brief), or a starting material in above.`}${deep < 0 ? "" : deep ? ` Scheme ${deep + 1} runs past the bottom of the page: draw the schemes from ${deep + 1} on in a new drawing (drawings new), or give a larger page (set_brief).` : ` ${name(0)} runs past the bottom of the page: give a larger page (set_brief), or draw its last steps in a new drawing.`}`;
}

// ---- A route (plan 5.4) ----

type SchemeIn = { title?: string; start: CompoundIn[]; steps: StepIn[] };
// legend: letters, as a paper's scheme has it: each step's letters over its arrow (its label, else the next letter)
// and its conditions in a note under the scheme, (a) to (z). A structure at an arrow stays there.
function lettered(steps: StepIn[]): { steps: StepIn[]; note?: string } {
  let next = 0;
  const notes: string[] = [], at = (l?: (string | CompoundIn)[]) => (l ?? []).filter(structured), free = (l?: (string | CompoundIn)[]) => textLines(l ?? []);
  const out = steps.map((st): StepIn => {
    const said = [...(st.reagents ?? []), ...(st.catalysts ?? []), ...free(st.above), ...(st.solvents ?? []), st.temperature, st.time, st.atmosphere, ...free(st.below), st.yield].map((t) => clean(t ?? "")).filter(Boolean);
    const label = st.label ? clean(st.label) : said.length ? "abcdefghijklmnopqrstuvwxyz"[next] : "";
    // (Only letters that go on from the last count: a step's own 'i' or 'ii' is its label, and the next is still b.)
    const letters = [...label.matchAll(/\b[a-z]\b/g)].map(([x]) => x.charCodeAt(0) - 97);
    if (letters[0] === next) next = Math.max(...letters) + 1;
    if (said.length) notes.push(`(${label}) ${said.join(", ")}`);
    return { arrow: st.arrow, products: st.products, label, above: at(st.above), below: at(st.below) };
  });
  return { steps: out, ...(notes.length ? { note: `Reagents and conditions: ${notes.join("; ")}.` } : {}) };
}
// A title as papers set it: "Scheme 1." in bold, then the rest.
const titled = (t: string) => { const [, head, rest] = /^((?:scheme|figure)\s+\S+?\.)\s*(.*)$/i.exec(clean(t)) ?? []; return head ? { runs: [{ text: head, bold: true }, ...(rest ? [{ text: ` ${rest}` }] : [])] } : { text: t }; };
// A whole synthesis in one call (plan 5.4): schemes one under another, each its title (free text, kept more than an
// arrow's conditions reach from the scheme: reaction.ts NEAR), then its reaction as draw's reaction kind draws it
// (wrapped to the page by Clean Up Reaction), then its note of conditions. The compounds are one series across the
// schemes (test plan C9): a product with changes and no from is from the compound before it; a scheme that starts
// from previous starts from the last product of the scheme before; and a compound from another with no changes is
// that one, drawn again under its number. A route of one scheme with no title is a reaction, and says what one says.
async function drawRoute(host: Host, a: { title?: string; schemes: SchemeIn[]; legend?: "none" | "letters"; keep_orientation?: boolean }, ctx: Ctx): Promise<Result> {
  const numbers = new Set<string>(), route = { ok: [] as Read[], boxes: [] as Box[] }, keep_orientation = a.keep_orientation;
  const alone = a.schemes.length === 1 && !a.title && !a.schemes[0].title && a.legend !== "letters";
  let last: string | undefined, branched = false;
  // A compound as the route reads it, and the numbers given so far.
  const chained = (c: CompoundIn, j: number, product: boolean): CompoundIn => {
    const given = c.from === undefined ? undefined : clean(c.from), from = given === "previous" && j && !product ? last ?? given : given ?? (product && c.changes?.length && c.text === undefined && !c.molecule ? "previous" : undefined);
    const number = c.number ?? (from !== undefined && !c.changes?.length && numbers.has(from) ? from : undefined);
    if (number) numbers.add(clean(number));
    return { ...c, ...(from !== undefined ? { from } : {}), ...(number ? { number } : {}) };
  };
  if (a.title) await addText(host, { text: a.title, bold: true });
  for (const [j, s] of a.schemes.entries()) {
    const start = s.start.map((c) => chained(c, j, false)), { steps, note } = a.legend === "letters" ? lettered(s.steps) : { steps: s.steps, note: undefined };
    // A scheme that does not start from the last product of the one before is a branch (test plan S4, S5).
    if (j && !start.some((c) => c.from === last || (c.number !== undefined && clean(c.number) === last))) branched = true;
    const scheme = { start, steps: steps.map((st) => ({ ...st, products: st.products.map((c) => chained(c, j, true)) })), keep_orientation };
    if (alone) return drawReaction(host, scheme, ctx);
    if (s.title) await addText(host, titled(s.title));
    const r = await drawReaction(host, scheme, ctx, route);
    if (r.error) throw new Error(`${a.schemes.length > 1 ? `Scheme ${j + 1}: ` : ""}${r.text}`);
    if (note) await addText(host, { text: note });
    // The last product, by its number, else its id (the last structure drawn), for the next scheme's previous.
    const ends = scheme.steps[scheme.steps.length - 1].products, end = ends[ends.length - 1].number, m = host.doc();
    last = end ? clean(end) : sid(m, [m.atoms.length - 1]);
    // (Down to the note under it, which the next scheme goes below.)
    route.boxes[j] = [route.boxes[j][0], drawnBox(host, m)![1], route.boxes[j][2], route.boxes[j][3]];
  }
  const counts = a.schemes.map((s) => s.steps.length), list = counts.length > 1 ? `${counts.slice(0, -1).join(", ")} and ${counts[counts.length - 1]}` : `${counts[0]}`;
  return {
    text: `Drew ${counts.length > 1 ? `${counts.length} schemes of ${list} steps` : `a scheme of ${list} step${counts[0] > 1 ? "s" : ""}`}${numbers.size ? ` with ${numbers.size} numbered compounds` : ""}. Octet laid out each with Clean Up Reaction.${unfit(host, route.boxes)}${branched ? " Octet drew each branch as a scheme of its own, under the one before, with a compound they share drawn again under its number: it does not join branches with arrows." : ""}${readAs(host, route.ok)}${UNDO}`,
    extra: () => ({ names: names(host, route.ok) }),
  };
}

async function drawCycle(host: Host, a: { intermediates: { text: string; number?: string }[]; centre?: string; steps?: { step: number; in?: string; out?: string; name?: string }[]; anticlockwise?: boolean } & Placement): Promise<Result> {
  const { ok, failed, wrong } = await read(host, a.intermediates);
  if (failed.length || wrong.length) return { text: `Octet drew nothing.${failedNote(failed, wrong)}`, error: true };
  const n = ok.length, sizes = ok.map((s) => boxOf(s.mol)), big = Math.max(...sizes.map((b) => Math.hypot(b[2] - b[0], b[3] - b[1])));
  const radius = Math.max(3, (big + 2) / (2 * Math.sin(Math.PI / n))), clockwise = !a.anticlockwise;
  let m = host.doc();
  const [x0, y0] = origin(host, m), centre: P = [x0 + radius + big / 2, y0 - radius - big / 2];
  const nodes: number[][] = [], at: number[] = [];
  ok.forEach((s, k) => {
    const t = Math.PI / 2 - ((clockwise ? 1 : -1) * 2 * Math.PI * k) / n, b = sizes[k], p: P = [centre[0] + radius * Math.cos(t), centre[1] + radius * Math.sin(t)];
    const r = place(m, s, p[0] - (b[2] - b[0]) / 2, p[1]);
    m = r.mol; nodes.push(r.atoms); at.push(t);
  });
  let id: number;
  [m, id] = addCycle(m, { centre, radius, clockwise, nodes, at });
  if (a.centre) m = addCaption(m, { text: clean(a.centre, true), x: centre[0], y: centre[1], align: "centre", cycle: { cycle: id, step: 0, side: "centre" } })[0];
  const sides: number[] = [];
  for (const st of a.steps ?? []) {
    if (st.step >= n) continue;
    const [i, o] = [st.in && clean(st.in, true), st.out && clean(st.out, true)];
    if (i || o) {
      const [mol, branch] = addSide(m, id, st.step, 0.5, i && o ? "both" : i ? "in" : "out");
      if (branch === undefined) continue;
      m = mol;
      if (i) m = addCaption(m, { text: i, x: 0, y: 0, cycle: { cycle: id, step: st.step, side: "in", branch } })[0];
      if (o) m = addCaption(m, { text: o, x: 0, y: 0, cycle: { cycle: id, step: st.step, side: "out", branch } })[0];
      sides.push(st.step);
    }
    if (st.name) m = addCaption(m, { text: clean(st.name, true), x: 0, y: 0, italic: true, cycle: { cycle: id, step: st.step, side: "name" } })[0];
  }
  m = host.set(m);
  await host.settle();
  host.tidyCycle(id);
  await host.settle();
  // A side arrow's text that lies on an intermediate: that end of the arrow goes further out from the circle, three
  // quarters of a bond length at a time, until its text is clear (6 times at most).
  const lying = () => {
    m = host.doc();
    const inks = m.cycles!.find((x) => x.id === id)!.nodes.map((atoms) => host.ink(atoms));
    return (m.captions ?? []).filter((t) => t.cycle?.cycle === id && isSide(t.cycle) && inks.some((b) => { const tb = b && host.textBox(t.id); return !!tb && overlap(tb, b!); }));
  };
  let on = lying();
  for (let k = 0; k < 6 && on.length; k++) {
    const out = (br: NonNullable<Cycle["branches"]>[number]) => on.reduce((x, { cycle: t }) => (t!.branch === x.id && (t!.side === "in" || t!.side === "out") ? { ...x, [t!.side]: { ...x[t!.side], reach: (x[t!.side]?.reach ?? 1.1) + 0.75 } } : x), br);
    host.set({ ...m, cycles: m.cycles!.map((x) => (x.id === id ? { ...x, branches: x.branches?.map(out) } : x)) });
    await host.settle();
    on = lying();
  }
  // The cycle with its text goes on the page, as a scheme does, and no higher than where new work starts. What does
  // not fit is said in the reply: side text still on an intermediate, and a cycle wider than the page.
  const st = host.style(), b = placed(a) ? undefined : boxOfIds(host, m, [`c${id}`]), d: P = b ? [across(st, b), Math.min(0, y0 - b[3])] : [0, 0];
  if (Math.hypot(...d) > 1e-6) { host.set(shift(m, new Set(nodes.flat()), new Set([id]), d)); await host.settle(); }
  const r1 = (v: number) => Math.round(v * 10) / 10, inside = -2 * leftMargin(st), wide = b && st.edges && !host.experiment() && b[2] - b[0] > inside + 1e-6;
  const advice = `${on.length ? ` The side text ${on.map((t) => `t${t.id}`).join(", ")} lies on an intermediate: give shorter side text.` : ""}${wide ? ` The cycle is ${r1(b[2] - b[0])} bond lengths wide (the page has ${r1(inside)}): give shorter side text, or a larger page or landscape (set_brief).` : ""}`;
  return { text: `Drew a catalytic cycle of ${n} intermediates, ${clockwise ? "clockwise" : "anticlockwise"}${sides.length ? `, with side arrows at step${sides.length > 1 ? "s" : ""} ${sides.join(", ")}` : ""}. Octet tidied it with Clean Up.${advice}${readAs(host, ok)}${UNDO}`, extra: () => ({ names: names(host, ok) }) };
}

// ---- Ids (D5) ----

// Each structure and its id: "s" and the key its atoms carry (Atom.key), given the first time Octet sees it and never
// again in this window. A structure copied, or split from another, takes a new key; one joined to another keeps the
// key of its first atom. Worked out once for each state of the drawing. A compound of several structures (a salt's
// ions, or the structures under one number: mixtures.ts compounds) is one structure here, with one id.
let lastKey = 0;
const keyed = new WeakMap<Mol, { atoms: number[]; id: string }[]>();
// A new drawing in this window (or a new drawing for a headless host) starts its ids again, so the same calls on a
// new drawing give the same ids (3e).
export function resetIds() { lastKey = 0; sources.clear(); startIds(); }
function structuresOf(m: Mol): { atoms: number[]; id: string }[] {
  const had = keyed.get(m);
  if (had) return had;
  for (const a of m.atoms) if (a.key !== undefined && a.key > lastKey) lastKey = a.key;
  const used = new Set<number>();
  // A structure's atoms in the order the drawing keeps them (the order a molecule or SMILES gave them), so an atom's
  // id (s3.2) is its place in what the AI app gave.
  const out = compounds(m, fragments(m)).map((g) => {
    g.sort((p, q) => p - q);
    let k = g.map((i) => m.atoms[i].key).find((x): x is number => x !== undefined && !used.has(x));
    if (k === undefined) k = ++lastKey;
    used.add(k);
    for (const i of g) m.atoms[i].key = k;
    return { atoms: g, id: `s${k}` };
  });
  keyed.set(m, out);
  return out;
}
const sid = (m: Mol, atoms: number[]) => structuresOf(m).find((s) => s.atoms.includes(atoms[0]))?.id;
// A structure by its id, its compound number ("5") or its name as Octet names it ("benzaldehyde") (T6).
function structureOf(m: Mol, id: string, host?: Host): number[] | undefined {
  const all = structuresOf(m), want = id.trim();
  const found = all.find((s) => s.id === want);
  if (found) return found.atoms;
  const number = (m.captions ?? []).find((c) => c.bold && c.under?.length && c.text.trim() === want);
  if (number) return all.find((s) => s.atoms.includes(number.under![0]))?.atoms;
  if (!host || want.length < 3 || all.length > 200) return undefined;
  return all.find((s) => about(host, pickPart(m, s.atoms)).name?.toLowerCase() === want.toLowerCase())?.atoms;
}

async function replaceStructure(host: Host, a: { structure: string; text?: string; from?: string; changes?: Change[] }): Promise<Result> {
  const m = host.doc(), atoms = structureOf(m, a.structure, host);
  if (!atoms) return { text: `There is no structure ${a.structure}. Call read for the ids.`, error: true };
  // Changes alone are made on the structure itself (as is from that names it): the new one is put where its own atoms
  // are, so no atom the changes leave moves. Any other is put with its middle where the old one's was.
  const own = a.text === undefined && (a.from === undefined ? !!a.changes : structureOf(m, a.from, host) === atoms);
  const { ok, failed, wrong } = await read(host, [{ text: a.text, from: own ? sid(m, atoms) : a.from, changes: a.changes }]);
  if (!ok.length) return { text: `Octet changed nothing.${failedNote(failed, wrong)}`, error: true };
  // The text under the old structure goes under the new one, as it was (its number, and a caption: the caption may
  // name the old structure, so the result says it is kept). A ChemDraw live property was the old structure's, and
  // is plain text now.
  const old = host.ink(atoms)!, under = (m.captions ?? []).filter((c) => c.under?.some((i) => atoms.includes(i))), number = under.find((c) => c.bold);
  const kept = erase(m, new Set(m.bonds.flatMap((b, k) => (atoms.includes(b.atoms[0]) ? [k] : []))), new Set(atoms));
  const b = boxOf(ok[0].mol), r = place(kept, ok[0], own ? b[0] : (old[0] + old[2]) / 2 - (b[2] - b[0]) / 2, own ? (b[1] + b[3]) / 2 : (old[1] + old[3]) / 2);
  host.set(under.reduce((mol, { id: _, property: _p, ...c }) => addCaption(mol, { ...c, under: r.atoms })[0], r.mol));
  await host.settle();
  // A structure made by changes is named, with what they did at each stereocentre and its new id, so the AI app
  // sees the change is the one it meant. One from text is named only when Octet read its name another way.
  const now = a.text === undefined ? about(host, ok[0].mol) : undefined, made = now ? ` with ${now.name ?? now.formula ?? "a structure"}${ok[0].note ? ` [${ok[0].note}]` : ""}, now ${sid(host.doc(), r.atoms)}` : "";
  return { text: `Replaced ${a.structure}${made}${number ? `, which keeps its number ${number.text}` : ""}${under.length > (number ? 1 : 0) ? `${number ? " and" : ", which keeps"} its caption` : ""}.${made ? "" : readAs(host, ok)}${UNDO}`, extra: () => ({ names: names(host, ok) }) };
}

async function remove(host: Host, a: { ids: string[] }): Promise<Result> {
  let m = host.doc();
  // A bond (s3.1-2) goes alone, with the carbons it leaves bare, as Delete on a selected bond does.
  const bonds = new Set(a.ids.flatMap((id) => { const k = bondOf(m, id, host); return k === undefined ? [] : [k]; }));
  const { atoms, items, unknown } = idsOf(host, m, a.ids.filter((id) => bondOf(m, id, host) === undefined));
  if (unknown.length) return { text: `There is nothing with the id ${unknown.join(", ")}. Call read for the ids.`, error: true };
  // The text that belongs to what goes: an arrow's conditions, a structure's number.
  for (const c of m.captions ?? []) if ((c.on && items.has(c.on.arrow)) || (c.under?.length && c.under.every((i) => atoms.has(i)))) items.add(c.id);
  // A plus sign between two structures that go.
  const gone = fragments(m).filter((g) => g.every((i) => atoms.has(i))).map((g) => host.ink(g)).filter((b): b is Box => !!b);
  for (const c of m.captions ?? []) if (c.text.trim() === "+" && !c.on && !c.under && gone.some((b) => c.x < b[0] && c.x > b[0] - 3 && c.y > b[1] - 1 && c.y < b[3] + 1) && gone.some((b) => c.x > b[2] && c.x < b[2] + 3 && c.y > b[1] - 1 && c.y < b[3] + 1)) items.add(c.id);
  if (items.size) m = deleteGraphics(m, items);
  if (atoms.size || bonds.size) m = erase(m, new Set(m.bonds.flatMap((b, k) => (bonds.has(k) || atoms.has(b.atoms[0]) || atoms.has(b.atoms[1]) ? [k] : []))), atoms);
  m = host.set(m);
  await host.settle();
  return { text: `Deleted ${a.ids.join(", ")}.${UNDO}` };
}

type TextIn = { text?: string; runs?: RunIn[]; id?: string; bold?: boolean; italic?: boolean; underline?: boolean; size?: number; font?: string; colour?: string; text_align?: Caption["align"]; width?: number; line_height?: "auto" | "variable" | number; angle?: number; arrow?: string; side?: "above" | "below" };
// A text's style as the Text menu sets it, for a caption.
const textStyle = (a: TextIn): Partial<Caption> => ({
  ...(a.bold ? { bold: true } : {}), ...(a.italic ? { italic: true } : {}), ...(a.underline ? { underline: true } : {}), ...(a.size ? { size: a.size } : {}), ...(a.font ? { font: clean(a.font) } : {}),
  ...(a.colour && a.colour !== "none" ? { colour: a.colour } : {}), ...(a.width ? { width: a.width } : {}), ...(a.line_height !== undefined && a.line_height !== "auto" ? { lineHeight: a.line_height } : {}), ...(a.angle ? { angle: a.angle } : {}),
});
async function addText(host: Host, a: TextIn): Promise<Result> {
  let m = host.doc();
  if ((a.text === undefined) === (a.runs === undefined)) return { text: "Give text or runs (one of them).", error: true };
  const r = a.runs ? runsOf(a.runs) : undefined;
  if (typeof r === "string") return { text: `Octet added nothing. ${r}.`, error: true };
  if (a.colour !== undefined && a.colour !== "none" && !COLOUR.test(a.colour)) return { text: `colour: give #rrggbb, not ${a.colour}.`, error: true };
  const text = r ? plain(r) : clean(a.text!, true), runs = r && { runs: r };
  if (a.id) {
    const n = Number(/^t(\d+)$/.exec(a.id)?.[1]);
    if (!m.captions?.some((c) => c.id === n)) return { text: `There is no text ${a.id}.`, error: true };
    m = { ...m, captions: m.captions.map((c) => (c.id === n ? { ...c, text, runs: r, ...textStyle(a) } : c)) };
    m = host.set(m);
    return { text: `Changed ${a.id} to "${text}".${UNDO}` };
  }
  // Conditions on an arrow (Add conditions above or below): kept centred on the arrow, and laid out by Clean Up
  // Reaction with the arrow's other conditions.
  if (a.arrow) {
    const n = Number(/^a(\d+)$/.exec(a.arrow)?.[1]), arrow = m.arrows?.find((x) => x.id === n);
    if (!arrow) return { text: `There is no arrow ${a.arrow}.`, error: true };
    if (!straightArrow(arrow)) return { text: `${a.arrow} is a ${arrow.kind} arrow, which takes no conditions: give a reaction, equilibrium, retro, resonance or no-go arrow.`, error: true };
    const side = a.side ?? "above", [mol, id] = addCaption(m, { text, ...runs, x: (arrow.from[0] + arrow.to[0]) / 2, y: (arrow.from[1] + arrow.to[1]) / 2, align: a.text_align ?? "centre", on: { arrow: n, side }, ...textStyle(a) });
    host.set(mol);
    await host.settle();
    return { text: `Added the text t${id} ${side} ${a.arrow} as its conditions.${UNDO}` };
  }
  // On an experiment page, text goes under its Procedure heading (and under text already there). Long text wraps to
  // the page's width less its margins (15 mm each side).
  const s = host.style(), k = 72 / 25.4 / s.bond, page = pageSize(s), heading = host.experiment() ? m.captions?.find((c) => c.bold && c.text.trim() === "Procedure" && !c.under && !c.on) : undefined;
  const below = heading && Math.min(heading.y, ...(m.captions ?? []).filter((c) => c !== heading && !c.on && !c.under && !c.cycle && c.y < heading.y && Math.abs(c.x - heading.x) < 0.5).map((c) => c.y - c.text.split("\n").length * 1.2 * (s.captionSize / s.bond)));
  // Else where new work starts: the top of its first line there (a text is placed by that line's baseline).
  const [x, y] = heading ? [heading.x, below! - 1.4 * (s.captionSize / s.bond)] : (([ox, oy]) => [ox, oy - ASCENT * ((a.size ?? s.captionSize) / s.bond)])(origin(host, m));
  const width = text.length > 60 ? (page[0] - 30) * k : undefined;
  const [mol, id] = addCaption(m, { text, ...runs, x, y, align: a.text_align ?? "left", ...(width ? { width } : {}), ...textStyle(a) });
  host.set(mol);
  await host.settle();
  return { text: `Added the text t${id}.${UNDO}` };
}

async function setStyle(host: Host, a: { preset?: string; page?: PageName; landscape?: boolean; page_size?: number[] }): Promise<Result> {
  if (a.page_size && a.page) return { text: "Give page or page_size, not both.", error: true };
  const custom = a.page_size && { page: "Custom" as const, custom: [a.page_size[0], a.page_size[1]] as [number, number], landscape: false };
  const s = host.style(), next: DocStyle = { ...s, ...(a.preset ? { ...presetAt(a.preset, s.scale), preset: a.preset } : {}), ...(a.page ? { page: a.page } : {}), ...(a.landscape !== undefined ? { landscape: a.landscape } : {}), ...custom };
  const laid = await applyStyle(host, next, !!(a.page || a.page_size || a.preset || a.landscape !== undefined));
  return { text: `The drawing now uses ${uses(next)}${laid ? `, and Octet laid out ${laid === 1 ? "its reaction" : `its ${laid} reactions`} again with Clean Up Reaction` : ""}.${UNDO}` };
}
const uses = (st: DocStyle) => `${st.preset} on ${st.page === "Custom" ? `a ${st.custom[0]} x ${st.custom[1]} mm page` : st.page}${st.landscape ? " (landscape)" : ""}`;
// The drawing in a new style and page, as Document settings give it (set_style, set_brief). layout: a new page or
// sizes, which lay every reaction out again (Clean Up Reaction), so a scheme wraps to the new width (J7). How many
// reactions were laid out again.
async function applyStyle(host: Host, next: DocStyle, layout: boolean): Promise<number> {
  const s = host.style();
  host.restyle(next);
  await host.settle();
  const arrows = new Set((host.doc().arrows ?? []).filter((x) => straightArrow(x)).map((x) => x.id));
  const laid = arrows.size && layout ? host.cleanReactions(arrows) : 0;
  await host.settle();
  // A new page: everything keeps its place from the page's top left corner (the page is centred on the drawing's
  // origin), then moves across together as `across` puts it, if it would still run past a margin (B4).
  const corner = (st: DocStyle): P => { const [pw, ph] = pageSize(st), kk = 72 / 25.4 / st.bond; return [(-pw / 2) * kk, (ph / 2) * kk]; };
  const [c0, c1] = [corner(s), corner(next)], move0: P = [c1[0] - c0[0], c1[1] - c0[1]];
  if (Math.hypot(...move0) > 1e-6) { host.set(shift(host.doc(), ...everything(host.doc()), move0)); await host.settle(); }
  let m = host.doc();
  const [w] = pageSize(next), k = 72 / 25.4 / next.bond;
  // Text that wraps (a procedure) wraps to the new page's width less its margins.
  const text = (w - 30) * k;
  if (m.captions?.some((c) => c.width !== undefined && c.width > text + 1e-6)) { m = host.set({ ...m, captions: m.captions.map((c) => (c.width !== undefined && c.width > text ? { ...c, width: text } : c)) }); await host.settle(); }
  const box = drawnBox(host, m), dx = box ? across(next, box) : 0;
  if (Math.abs(dx) > 1e-6) { host.set(shift(m, ...everything(m), [dx, 0])); await host.settle(); }
  return laid;
}

// ---- The brief (plan section 3, Sam's rule): before a scheme, route, figure, cycle or grid is drawn, the user is
// asked three questions, and the answers come to Octet through set_brief ----

type BriefIn = { style?: { from_file?: string; from_drawing?: string; none?: boolean }; destination: { kind: (typeof DESTINATIONS)[number]; journal?: string; columns?: number; size_mm?: number[] }; emphasis?: string; layout?: string };
// What draws a scheme, route, figure, cycle or grid. One structure needs no brief (Sam), so a grid is more than one;
// a change of several operations needs it when one of them does, or when they draw more than one structure in all.
const SCHEMES = new Set(["reaction", "route", "cycle", "figure"]), many = (v: unknown) => (Array.isArray(v) ? v.length : 0);
const needsBrief = (op: string, a: any): boolean => SCHEMES.has(op) || (op === "structures" && many(a.structures) > 1) ||
  (op === "batch" && Array.isArray(a.steps) && (a.steps.some((x: any) => SCHEMES.has(x?.tool)) || a.steps.reduce((n: number, x: any) => n + (x?.tool === "structures" ? many(x.args?.structures) : 0), 0) > 1));
// A journal as the user names it: the one preset whose name, or a journal named in its brackets (Angewandte,
// Synthesis), starts so (case, spaces and stops aside), else none, with the preset nearest it: its publisher's, or ACS
// Document 1996 (Octet never picks a preset on its own: the user does).
const squash = (t: string) => t.toLowerCase().replace(/[^a-z0-9]/g, "");
const NEAREST: [RegExp, string][] = [[/^(rsc|chemcomm|chemsci|dalton|orgbiomol|obc)/, "RSC"], [/^(angew|wiley|chemeur|eurjoc|chemasian)/, "Wiley (Angewandte)"], [/^nat/, "Nature"], [/^(thieme|synth|synlett)/, "Thieme (Synthesis, Synlett)"]];
function journalOf(t: string): { preset?: string; nearest: string } {
  const s = squash(t), names = (p: string) => [p, ...(/\((.*)\)/.exec(p)?.[1].split(", ") ?? [])].map(squash);
  const hits = Object.keys(PRESETS).filter((p) => names(p).some((n) => n.startsWith(s))), preset = s ? hits.find((p) => names(p).includes(s)) ?? (hits.length === 1 ? hits[0] : undefined) : undefined;
  return { preset, nearest: preset ?? NEAREST.find(([r]) => r.test(s))?.[1] ?? "ACS Document 1996" };
}
async function setBrief(host: Host, a: BriefIn, ctx: Ctx): Promise<Result> {
  const d = a.destination, s = host.style(), w = host.window(), why = (t: string): Result => ({ text: t, error: true });
  // Question 1: the user's own style, from a file's text (every value of its document style) or from this drawing.
  let own: DocStyle | undefined;
  if (a.style?.none) own = undefined;
  else if (a.style?.from_file !== undefined) {
    const t = a.style.from_file, head = t.slice(0, 65536);
    if (!isDrawingText(t)) return why("from_file is not the text of a CDXML or .oct file. Ask the user for a drawing saved by ChemDraw or Octet, or give style none.");
    let read: Mol;
    try { read = readOct(t).mol; } catch (e) { return why(`Octet cannot read from_file: ${e instanceof Error ? e.message : String(e)} Ask the user for the drawing again, or give style none.`); }
    // A CDXML file says its style on the document (ChemDraw and Octet write each value there); one that does not has
    // only Octet's defaults to give.
    if (!read.style || (/<CDXML[\s>/]/.test(head) && !/<CDXML\s[^>]*\b(?:BondLength|LineWidth|LabelSize)=/.test(head))) return why("from_file has no document style. Ask the user for a drawing in their style, or give style none.");
    own = read.style;
  } else if (a.style?.from_drawing !== undefined) {
    if (![w.id, w.name].includes(clean(a.style.from_drawing))) return why(`Octet reads the style of this session's drawing (${w.id}) only. For another drawing: drawings use it, read with format cdxml, and give that text as from_file.`);
    own = s;
  }
  // Question 2: the destination's purpose (its page, and its sizes at its scale), with a journal's preset and column.
  const journal = d.journal === undefined ? undefined : journalOf(d.journal);
  if (journal && !squash(d.journal!)) return why("journal is empty. Give the journal's name, or leave journal out.");
  if (journal && !journal.preset) return why(`Octet has no preset for ${short(clean(d.journal!), 60).replace(/\.$/, "")}. The nearest it has is ${journal.nearest}. Ask the user whether to use it (journal: '${journal.nearest}'), or give size_mm for the page.`);
  if (d.columns && d.size_mm) return why("Give columns or size_mm, not both.");
  if (d.kind === "quick" && (d.columns || d.size_mm)) return why("Quick start has no page, so columns and size_mm do not go with it. Give the kind of the destination (paper, thesis, slides, poster or notebook), or leave them out.");
  const kind = d.kind === "quick" ? undefined : d.kind === "notebook" ? (host.experiment() ? "experiment" : "paper") : d.kind, base = kind ? purposeStyle(kind) : QUICK_STYLE;
  const look = journal?.preset ?? (own ?? base).preset, column = d.columns ? COLUMNS[look]?.[d.columns - 1] : undefined, size = d.size_mm ?? column?.slice(1) as number[] | undefined;
  const page = size ? { page: (Object.keys(PAGES) as PageName[]).find((p) => PAGES[p as keyof typeof PAGES].every((v, k) => v === size[k])) ?? "Custom", custom: [size[0], size[1]], landscape: false } : { page: base.page, landscape: base.landscape };
  const next = readStyle({ ...(own ?? forPurpose(s, { ...base, ...(journal ? presetAt(journal.preset!, base.scale) : {}) })), ...page, edges: !!kind, purpose: kind });
  const restyled = !sameStyle(s, next) || s.purpose !== next.purpose, laid = restyled ? await applyStyle(host, next, !sameStyle(s, next)) : 0;
  // Advice on fit (plan 3.2): the room the page gives, what of the drawing is off it now, and the choices. Quick
  // start has no page, so it has none. Octet never makes text smaller to fit.
  const [pw, ph] = pageSize(next), k = 72 / 25.4 / next.bond, r1 = (v: number) => Math.round(v * 10) / 10, check = kind ? layoutCheck(host, host.doc()) : "clean", off = check === "clean" ? [] : check.off_page ?? [];
  const advice = !kind ? " With no page, nothing runs off it." : ` Inside its margins the page is ${r1((pw - 30) * k)} by ${r1((ph - 30) * k)} bond lengths.${off.length ? ` ${off.join(", ")} ${off.length > 1 ? "run" : "runs"} past the page now: give more rows, split it into schemes, give two columns or a larger page (set_brief).` : ""}${d.columns && !column ? ` Octet has no ${d.columns}-column page for ${look}: give size_mm.` : ""}${d.kind === "notebook" && kind !== "experiment" ? " For an experiment page with a reagent table, call drawings with action new, for experiment." : ""}`;
  // The brief as Octet keeps it for the session, and what changed since the last one (B6).
  const brief = { destination: { kind: d.kind, ...(journal ? { journal: journal.preset } : {}), ...(d.columns ? { columns: d.columns } : {}), ...(d.size_mm ? { size_mm: d.size_mm } : {}) }, style: a.style?.from_file !== undefined && own ? "from_file" : own ? "from_drawing" : "destination", ...(a.emphasis ? { emphasis: clean(a.emphasis) } : {}), ...(a.layout ? { layout: clean(a.layout) } : {}) };
  let was: Record<string, unknown> | undefined;
  try { was = ctx.brief ? JSON.parse(ctx.brief) : undefined; } catch { was = undefined; }
  const changed = was ? (Object.keys({ ...was, ...brief }) as (keyof typeof brief)[]).filter((x) => JSON.stringify(was![x]) !== JSON.stringify(brief[x])) : [];
  const json = JSON.stringify(brief);
  await ctx.keep?.(json);
  const told = was ? (changed.length ? `Octet changed the brief's ${changed.join(", ")}.` : "The brief is as it was.") : "Octet keeps this brief for the session.";
  const now = `${kind ? uses(next) : `${next.preset} with no page (Quick start)`}, with ${next.labelSize} pt labels and ${next.bond} pt bonds${laid ? `, and Octet laid out ${laid === 1 ? "its reaction" : `its ${laid} reactions`} again with Clean Up Reaction` : ""}`;
  return { text: `${told} The drawing ${restyled ? "now uses" : "uses"} ${now}.${own && journal ? ` The style is the user's own, in place of ${journal.preset}'s.` : ""}${advice}${brief.emphasis || brief.layout ? " Follow its emphasis and layout as you draw." : ""}${restyled ? UNDO : ""}\n${json}`, data: { brief } };
}

async function fillExperiment(host: Host, a: { details?: Details; amounts?: ({ of: string; limiting?: boolean } & Partial<Record<Field, string>>)[] }): Promise<Result> {
  if (!host.experiment()) return { text: "This drawing is not an experiment page. Ask the user to choose File > New For > Experiment.", error: true };
  let m = host.doc();
  const said: string[] = [];
  // Solvent, temperature and time come from the newest reaction's conditions where they are not given (3b).
  const newest = [...(m.arrows ?? [])].reverse().find((x) => straightArrow(x) && host.reaction(x.id)), f = newest ? fieldsOf(host, m, newest.id) : undefined;
  const fromReaction: Details = { ...(f?.solvents ? { solvent: f.solvents.map((x) => x.text).join(", ") } : {}), ...(f?.temperature ? { temperature: f.temperature } : {}), ...(f?.time ? { time: f.time } : {}) };
  const had = detailsOf(m.annotations), filled = Object.fromEntries(Object.entries(fromReaction).filter(([k]) => !had[k as keyof Details] && !a.details?.[k as keyof Details]));
  if (a.details || Object.keys(filled).length) {
    const details: Details = { ...had, ...filled };
    for (const [k, v] of Object.entries(a.details ?? {})) details[k as keyof Details] = clean(v as string);
    m = { ...m, annotations: withDetails(m.annotations, details) };
    said.push(`set ${[...Object.keys(a.details ?? {}), ...Object.keys(filled).map((k) => `${k} (from the reaction)`)].join(", ")}`);
  }
  if (a.amounts?.length) {
    // The newest reaction's reagent table, made for it when it has none (as Analyse Stoichiometry makes one).
    const last = [...(m.arrows ?? [])].reverse().find((x) => straightArrow(x) && host.reaction(x.id));
    if (!m.grids?.length && last) m = { ...m, grids: [{ arrow: last.id, typed: {} }] };
    const grid = m.grids?.[m.grids.length - 1];
    if (!grid) return { text: "There is no reaction on the page. Draw it first (draw_route), then fill in its amounts.", error: true };
    const r = host.reaction(grid.arrow), typed = { ...grid.typed }, problems: string[] = [], unused: string[] = [];
    let limiting = grid.limiting;
    for (const x of a.amounts) {
      const key = await keyOf(host, m, r, clean(x.of));
      if (!key) { problems.push(`"${x.of}" is not in the reaction`); continue; }
      const plain = key.startsWith('r:"') ? key.slice(3, -1) : undefined;
      if (plain !== undefined && !host.reagent(plain)) { problems.push(`"${x.of}" has no column in the table, as Octet reads no formula from it (write it as a formula, such as H2SO4)`); continue; }
      const values = { ...(typed[key] ?? {}) };
      for (const f of ["mass", "moles", "equiv", "volume", "density", "molarity", "purity", "measured"] as Field[]) {
        if (x[f] === undefined) continue;
        const v = parseAmount(x[f]!, f);
        if (v === undefined) problems.push(`${f} "${x[f]}" for ${x.of}`); else values[f] = v;
      }
      typed[key] = values;
      if (x.limiting) limiting = key;
      if (values.volume !== undefined && values.density === undefined && values.molarity === undefined && values.mass === undefined && values.moles === undefined) unused.push(x.of);
    }
    m = { ...m, grids: m.grids!.map((g) => (g === grid ? { ...g, typed, ...(limiting ? { limiting } : {}) } : g)) };
    const n = a.amounts.length - problems.filter((p) => p.includes("not in")).length;
    said.push(`typed amounts for ${n} compound${n === 1 ? "" : "s"}`);
    if (problems.length) said.push(`cannot read ${problems.join("; ")}`);
    // A volume with no density (or molarity) gives no moles: say so, as the table counts that compound as 1.00 eq.
    if (unused.length) said.push(`cannot use the volume of ${unused.join(", ")} without a density (or a molarity): give it, or the mass or moles`);
  }
  m = host.set(m);
  await host.settle();
  // The table as Octet works it out (moles, equivalents, masses, the yield), so the AI app can check it without a read.
  const round = (v: unknown) => (typeof v === "number" ? Math.round(v * 1000) / 1000 : v);
  const tables = host.tables().map((t) => ({ table: `g${t.arrow}`, columns: t.columns.map((c) => ({ what: c.what.replace(/^"(.*)"$/, "$1"), formula: c.formula, ...(c.product ? { product: true } : {}), typed: c.typed, ...(c.worked ? { worked: Object.fromEntries(Object.entries(c.worked).map(([k, v]) => [k, round(v)])) } : {}) })) }));
  return { text: `On the experiment page, Octet ${said.join(", and ")}. Octet works out the rest of the grid (moles, equivalents, expected mass): tables, in the data.${UNDO}`, data: { tables } };
}
// The grid key ("r:C2H4O2", 'r:"H2SO4"', "p:…") of the compound `of` names in reaction r.
async function keyOf(host: Host, m: Mol, r: Reaction | undefined, of: string): Promise<string | undefined> {
  if (!r) return undefined;
  const products = new Set(r.steps.slice(r.steps.map((s) => s.kind).lastIndexOf("arrow") + 1).flatMap((s) => (s.kind === "structure" ? s.atoms : [])));
  const caption = (m.captions ?? []).find((c) => r.captions.includes(c.id) && !c.under && conditionItems(c.text).some((t) => t.toLowerCase() === of.toLowerCase()));
  if (caption) return `r:"${conditionItems(caption.text).find((t) => t.toLowerCase() === of.toLowerCase())}"`;
  const numbered = (m.captions ?? []).find((c) => c.bold && c.text === of && c.under);
  let atoms = numbered?.under;
  if (!atoms) {
    const { ok } = await read(host, [{ text: of }]), want = ok[0] && host.formula(ok[0].mol);
    atoms = want ? structuresOf(m).find((g) => r.atoms.includes(g.atoms[0]) && host.formula(pickPart(m, g.atoms)) === want)?.atoms : undefined;
  }
  const f = atoms && host.formula(pickPart(m, atoms));
  return f ? `${atoms!.some((i) => products.has(i)) ? "p" : "r"}:${f}` : undefined;
}
const pickPart = (m: Mol, atoms: number[]) => extractSelection(m, new Set(atoms), new Set());

// Ids from a read to atoms and objects; the ids that name nothing. A cycle's id is the whole cycle, as a picked
// cycle is in the editor: its intermediates and its text too.
function idsOf(host: Host, m: Mol, ids: string[]): { atoms: Set<number>; items: Set<number>; unknown: string[] } {
  const atoms = new Set<number>(), items = new Set<number>(), unknown: string[] = [];
  for (const given of ids) {
    // A reagent table (g2, as warnings name it) belongs to its arrow (a2).
    const id = /^g\d+$/.test(given) && m.arrows?.some((x) => x.id === Number(given.slice(1))) ? `a${given.slice(1)}` : given;
    // An object's own id first (t5, a7, c2, b9): looking it up as a structure's number or name would name every
    // structure in the drawing.
    const n = /^[tacb](\d+)$/.exec(id)?.[1], cycle = id.startsWith("c") ? m.cycles?.find((c) => c.id === Number(n)) : undefined;
    const object = !cycle && n !== undefined && [...(m.captions ?? []), ...(m.arrows ?? []), ...(m.shapes ?? [])].some((x) => x.id === Number(n));
    // An atom (s3.2) or a bond (s3.1-2) alone: its atoms, as when the user drags an atom or a bond. (Looked up before
    // a structure: a structure's name lookup names every structure.)
    const bond = cycle || object ? undefined : bondOf(m, id, host), atom = cycle || object || bond !== undefined ? undefined : atomOf(m, id, host);
    const s = cycle || object || bond !== undefined || atom !== undefined ? undefined : structureOf(m, id, host);
    if (s) s.forEach((i) => atoms.add(i));
    else if (bond !== undefined) m.bonds[bond].atoms.forEach((i) => atoms.add(i));
    else if (atom !== undefined && !id.endsWith(":pair")) atoms.add(atom);
    else if (cycle) { items.add(cycle.id); cycle.nodes.flat().forEach((i) => atoms.add(i)); (m.captions ?? []).filter((c) => c.cycle?.cycle === cycle.id).forEach((c) => items.add(c.id)); }
    else if (object) items.add(Number(n));
    else unknown.push(given);
  }
  return { atoms, items, unknown };
}

async function select(host: Host, a: { ids: string[] }): Promise<Result> {
  const { atoms, items, unknown } = idsOf(host, host.doc(), a.ids);
  if (unknown.length) return { text: `There is nothing with the id ${unknown.join(", ")}. Call read for the ids.`, error: true };
  host.select([...atoms], [...items]);
  return { text: a.ids.length ? `Selected ${a.ids.join(", ")}.` : "Nothing is selected." };
}

// File > New For, in a window of its own, so that each session can have its own drawing (D1); where there are no
// windows (the web component), in this one. The answer waits until the new window is there, and the session's calls
// go to it.
async function newDrawing(host: Host, a: { for: string; text?: string }, ctx: Ctx): Promise<Result> {
  // The window this call opened, by its id: two AI apps opening drawings at once each get their own. A file's text
  // needs a window of its own (add_file adds one to this drawing).
  const opened = await host.newWindow(a.for, a.text);
  if (!opened && (a.text !== undefined || !host.command(`new_${a.for}`))) return { text: "Octet cannot open a new drawing now.", error: true };
  for (const end = Date.now() + 8000; opened && Date.now() < end;) {
    if ((await host.windows()).some((w) => w.id === opened)) { await host.target(ctx.session, opened); return { text: `Octet opened a new drawing ${a.text === undefined ? `for ${a.for}` : "of the file"}: ${opened}. This session's calls go to it now.`, data: { opened } }; }
    await new Promise((r) => { const c = new MessageChannel(); c.port1.onmessage = r; c.port2.postMessage(0); });
  }
  if (opened) return { text: "Octet opened a new window, but it did not start in time. Call drawings, then drawings with use.", error: true };
  await host.settle();
  resetIds();
  return { text: `Octet started a new drawing for ${a.for} in ${host.window().id}, which had nothing in it. This session's calls go to it.`, data: { opened: host.window().id } };
}

// Atoms and objects (arrows, free text, cycles, shapes) moved by d; text tied to them (numbers, conditions, a cycle's
// text) goes with them as the renderer places it.
function shift(m: Mol, atoms: Set<number>, items: Set<number>, d: P): Mol {
  const by = (p: [number, number]): [number, number] => [p[0] + d[0], p[1] + d[1]];
  m = moveAtoms(m, atoms, d);
  return {
    ...m, arrows: m.arrows?.map((x) => (items.has(x.id) ? { ...x, from: by(x.from), to: by(x.to), ...(x.curve ? { curve: { ...x.curve, points: x.curve.points.map((q) => ({ ...q, at: by(q.at), ...(q.c1 ? { c1: by(q.c1) } : {}), ...(q.c2 ? { c2: by(q.c2) } : {}) })) } } : {}) } : x)),
    captions: m.captions?.map((c) => (items.has(c.id) && !c.under && !c.on && !c.cycle ? { ...c, x: c.x + d[0], y: c.y + d[1] } : c)),
    cycles: m.cycles?.map((c) => (items.has(c.id) ? { ...c, centre: by(c.centre) } : c)), shapes: m.shapes?.map((x) => (items.has(x.id) ? { ...x, from: by(x.from), to: by(x.to) } : x)),
  };
}
const everything = (m: Mol): [Set<number>, Set<number>] => [new Set(m.atoms.map((_, i) => i)), new Set([...(m.captions ?? []), ...(m.arrows ?? []), ...(m.cycles ?? []), ...(m.shapes ?? [])].map((x) => x.id))];
// The page's left margin (15 mm), drawing units.
const leftMargin = (s: DocStyle) => (15 - pageSize(s)[0] / 2) * (72 / 25.4 / s.bond);
// How far across the page a box moves to lie on it: inside the left and right margins; in the middle of the page when
// it is wider than that and no wider than the page (Clean Up Reaction wraps to the page less half an inch each side, a
// little more than the page inside its margins); from the left margin when it is wider than the page.
const across = (s: DocStyle, b: Box) => { const left = leftMargin(s), w = b[2] - b[0]; return w > -2 * left && w <= pageSize(s)[0] * (72 / 25.4 / s.bond) + 1e-6 ? -(b[0] + b[2]) / 2 : Math.max(left - b[0], Math.min(0, -left - b[2])); };

async function move(host: Host, a: { ids: string[]; dx?: number; dy?: number } & Placement): Promise<Result> {
  let m = host.doc();
  const { atoms, items, unknown } = idsOf(host, m, a.ids);
  if (unknown.length) return { text: `There is nothing with the id ${unknown.join(", ")}. Call read for the ids.`, error: true };
  const by = a.dx !== undefined || a.dy !== undefined;
  if (by === placed(a)) return { text: by ? "Give dx and dy, or a place (to, right_of, left_of, below or above), not both." : "Give dx and dy, or a place: to [x, y], or right_of, left_of, below or above an id.", error: true };
  // Text Octet places itself (a number, a reaction's conditions, a cycle's text) goes with what it belongs to.
  const own = a.ids.filter((id) => { const c = /^t\d+$/.test(id) ? m.captions?.find((x) => x.id === Number(id.slice(1))) : undefined; return !!(c && (c.on || c.under || c.cycle)); });
  const tied = own.length ? ` Octet places ${own.join(", ")} itself, with the structure, arrow or cycle ${own.length > 1 ? "they belong" : "it belongs"} to: move that instead.` : "";
  if (own.length === a.ids.length) return { text: `Octet moved nothing.${tied}`, error: true };
  const wrong = by ? undefined : placeProblem(host, m, a);
  if (wrong) return { text: `Octet moved nothing. ${wrong}`, error: true };
  const d: P = by ? [a.dx ?? 0, a.dy ?? 0] : target(host, m, boxOfIds(host, m, a.ids)!, a);
  m = shift(m, atoms, items, d);
  m = host.set(m);
  return { text: `Moved ${a.ids.filter((id) => !own.includes(id)).join(", ")} by ${Math.round(d[0] * 100) / 100}, ${Math.round(d[1] * 100) / 100}.${tied}${UNDO}` };
}

async function setNumber(host: Host, a: { structure: string; number: string }): Promise<Result> {
  let m = host.doc();
  const atoms = structureOf(m, a.structure, host), number = clean(a.number);
  if (!atoms) return { text: `There is no structure ${a.structure}. Call read for the ids.`, error: true };
  const had = (m.captions ?? []).find((c) => c.bold && c.under?.some((i) => atoms.includes(i)));
  if (had) m = number ? { ...m, captions: m.captions!.map((c) => (c === had ? { ...c, text: number, runs: undefined } : c)) } : deleteGraphics(m, new Set([had.id]));
  else if (number) m = addCaption(m, { text: number, x: 0, y: 0, bold: true, under: atoms })[0];
  m = host.set(m);
  return { text: number ? `${a.structure} is now compound ${number}.${UNDO}` : `${a.structure} has no number now.${UNDO}` };
}

async function arrange(host: Host, a: { ids: string[]; how: string }): Promise<Result> {
  const m = host.doc(), { atoms, items, unknown } = idsOf(host, m, a.ids), was = host.selection();
  if (unknown.length) return { text: `There is nothing with the id ${unknown.join(", ")}. Call read for the ids.`, error: true };
  // Shapes as wide, as tall or as big as the largest, each keeping its top left corner (F6). Octet's own, as Keynote's
  // and Figma's: ChemDraw has no such command.
  if (a.how.startsWith("same_")) {
    const shapes = (m.shapes ?? []).filter((x) => a.ids.includes(`b${x.id}`)), not = a.ids.filter((id) => !shapes.some((x) => `b${x.id}` === id));
    if (shapes.length < 2) return { text: "Give two or more shapes (b ids) to make the same size.", error: true };
    const size = (x: (typeof shapes)[number]) => { const b = corners([x.from, x.to]); return [b[2] - b[0], b[3] - b[1]]; }, w = Math.max(...shapes.map((x) => size(x)[0])), h = Math.max(...shapes.map((x) => size(x)[1]));
    host.set({ ...m, shapes: m.shapes!.map((x) => {
      if (!shapes.includes(x)) return x;
      const b = corners([x.from, x.to]), [nw, nh] = [a.how === "same_height" ? b[2] - b[0] : w, a.how === "same_width" ? b[3] - b[1] : h];
      return { ...x, from: [b[0], b[3]] as P, to: [b[0] + nw, b[3] - nh] as P };
    }) });
    return { text: `Made ${shapes.map((x) => `b${x.id}`).join(", ")} the same ${a.how.slice(5)}.${not.length ? ` Not changed (not shapes): ${not.join(", ")}.` : ""}${UNDO}` };
  }
  if (a.how !== "page" && structuresOf(m).filter((s) => s.atoms.some((i) => atoms.has(i))).length + items.size < 2) return { text: "Give two or more things to line up.", error: true };
  host.select([...atoms], [...items]);
  await host.settle();
  const ran = host.command(a.how === "page" ? "centre_page" : `arrange_${a.how}`);
  await host.settle();
  host.select(was.atoms, was.items);
  return ran ? { text: `Lined up ${a.ids.join(", ")}: ${a.how === "page" ? "centred on the page" : ["across", "down"].includes(a.how) ? `spaced evenly ${a.how}` : `${a.how} edges`}.${UNDO}` } : { text: "Octet cannot line them up now (a dialog is open).", error: true };
}

async function getFile(host: Host, a: { format: FileFormat; ids?: string[] } & FileOptions): Promise<Result> {
  // (A window that has just opened, --convert, has no Indigo yet. A file needs no names engine.)
  await host.ready(false);
  const m = host.doc();
  let part: Mol | undefined;
  if (a.ids?.length) {
    const { atoms, items, unknown } = idsOf(host, m, a.ids);
    if (unknown.length) return { text: `There is nothing with the id ${unknown.join(", ")}. Call read for the ids.`, error: true };
    part = extractSelection(m, atoms, items);
  }
  const { format: _, ids: __, ...o } = a, text = await host.fileText(a.format, part, o);
  if (!text) return { text: `Octet cannot write ${a.ids?.length ? "these" : "this drawing"} as ${a.format}${a.format === "rxn" ? " (an RXN file holds one reaction step)" : ""}.`, error: true };
  return { text, data: { format: a.format, text, ...(a.ids?.length ? { ids: a.ids } : {}) } };
}

// ---- Edit, arrow, shape (3f) ----

const bondKind = (b: Mol["bonds"][number]): BondKind | undefined => (Object.keys(BONDS) as BondKind[]).find((k) => { const s: { type: number; stereo?: number; display?: string } = BONDS[k].spec; return s.type === b.type && s.stereo === b.stereo && s.display === b.display; });
// An atom id (s3.2: the structure, and its atom's place in it), a bond id (s3.1-2), or "s3.2:pair" (a lone pair on it).
function atomOf(m: Mol, id: string, host: Host): number | undefined {
  const x = /^(.+)\.(\d+)(?::pair)?$/.exec(id.trim());
  const g = x && structureOf(m, x[1], host);
  return g?.[Number(x![2]) - 1];
}
function bondOf(m: Mol, id: string, host: Host): number | undefined {
  const x = /^(.+)\.(\d+)-(\d+)$/.exec(id.trim()), g = x && structureOf(m, x[1], host);
  if (!g) return undefined;
  const [p, q] = [g[Number(x![2]) - 1], g[Number(x![3]) - 1]];
  const k = m.bonds.findIndex((b) => (b.atoms[0] === p && b.atoms[1] === q) || (b.atoms[0] === q && b.atoms[1] === p));
  return k < 0 ? undefined : k;
}
const COLOUR = /^#[0-9a-fA-F]{6}$/;
type QueryIn = { substituents?: "free" | "upto" | "exactly"; n?: number; no_h?: boolean; rings?: AtomQuery["rings"]; unsaturation?: AtomQuery["unsat"]; change?: boolean; stereo?: AtomQuery["stereo"]; valence?: boolean };
type TableIn = { cells?: string[][]; lines?: keyof typeof TABLE_LINES; align?: CellAlign[]; weight?: number };
type SpotIn = { lane: number; rf: number; colour?: string; style?: "filled" | "hollow" | "shaded"; dashed?: boolean; bold?: boolean; doubled?: boolean; width?: number; height?: number; tail?: number; show_rf?: boolean };
type TlcIn = { lanes?: number; spots?: SpotIn[]; rf?: boolean; origin?: number; front?: number; hide?: ("origin" | "front" | "border")[]; ticks?: boolean; transparent?: boolean };
type HeadSizeIn = "large" | "medium" | "small" | { length: number; centre: number; width: number };
type ArrowIn = { kind?: string; style?: LineStyle | "plain"; start?: Head; end?: Head; head?: HeadShape; head_size?: HeadSizeIn; bend?: number; ratio?: number; shaft?: number; line_width?: number; fill?: CurveFill | "none"; orbital_shape?: OrbitalShape; orbital_phase?: Phase; colour?: string };
type ShapeIn = { dashed?: boolean; bold?: boolean; fill?: "solid" | "shaded" | "faded" | "none"; shadow?: boolean; mark?: string; radius?: number; line_width?: number; bracket_side?: "left" | "right" | "both"; usage?: BracketUsage; bracket_label?: string; shade_depth?: number; shade_blur?: number; shade_opacity?: number; table?: TableIn; tlc?: TlcIn; png?: string; rgroup?: string; colour?: string };
type Edit = { ids: string[]; changes?: Change[]; runs?: RunIn[]; box?: number[]; ignore_warnings?: boolean; label?: string; charge?: number; isotope?: number; radical?: (typeof RADICALS)[number]; lone_pairs?: number; bars?: boolean; enhanced?: string; atom_number?: string; hidden?: boolean; chemical?: boolean; label_angle?: number; query?: QueryIn;
  bond?: BondKind; position?: "left" | "centre" | "right" | "auto"; spacing?: number; topology?: "ring" | "chain" | "either" | "none"; reaction_centre?: NonNullable<Mol["bonds"][number]["rxn"]> | "none"; bond_query?: "any" | "sd" | "sa" | "da" | "none";
  highlight?: string; ring_fill?: string; rotate?: number; scale?: number; flip?: "horizontal" | "vertical"; perspective?: boolean; stereo_labels?: boolean; atom_numbers?: boolean; aromatic_circles?: boolean;
  text?: string; bold?: boolean; italic?: boolean; underline?: boolean; size?: number; font?: string; colour?: string; align?: Caption["align"] | Atom["align"] | "auto"; width?: number; line_height?: "auto" | "variable" | number; arrow?: string; side?: "above" | "below";
  from?: number[]; to?: number[]; structure?: string; number?: string } & ArrowIn & ShapeIn;

// A table as given (cells, lines, alignment, rule width), over the one a shape has.
function tableOf(t: TableIn, was?: Table): Table {
  const cells = t.cells ? t.cells.map((row) => row.map((c) => clean(c, true))) : was?.cells ?? newTable(3, 3).cells, cols = Math.max(1, ...cells.map((r) => r.length));
  return { ...(was ?? newTable(cells.length, cols)), cells: cells.map((row) => [...row, ...Array.from({ length: cols - row.length }, () => "")]), ...(t.lines ? { lines: TABLE_LINES[t.lines], grid: undefined } : {}), ...(t.align ? { align: t.align } : {}), ...(t.weight ? { weight: t.weight } : {}) };
}
// A TLC plate as given, over the one a shape has.
function tlcOf(t: TlcIn, was?: Shape["tlc"]): Shape["tlc"] {
  const spot = (s: SpotIn): Spot => ({ lane: s.lane, rf: s.rf, ...(s.colour ? { colour: s.colour } : {}), ...(s.style && s.style !== "filled" ? { style: s.style } : {}), ...(s.dashed ? { dashed: true as const } : {}), ...(s.bold ? { bold: true as const } : {}), ...(s.doubled ? { doubled: true as const } : {}), ...(s.width ? { w: s.width } : {}), ...(s.height ? { h: s.height } : {}), ...(s.tail ? { tail: s.tail } : {}), ...(s.show_rf ? { showRf: true as const } : {}) });
  const lanes = t.lanes ?? was?.lanes ?? 1;
  return { ...(was ?? { lanes, spots: [] }), lanes, ...(t.spots ? { spots: t.spots.map(spot).filter((s) => s.lane < lanes) } : {}), ...(t.rf !== undefined ? { rf: t.rf || undefined } : {}), ...(t.origin !== undefined ? { origin: t.origin } : {}), ...(t.front !== undefined ? { front: t.front } : {}), ...(t.hide ? { hide: t.hide.length ? t.hide : undefined } : {}), ...(t.ticks !== undefined ? { ticks: t.ticks || undefined } : {}), ...(t.transparent !== undefined ? { transparent: t.transparent || undefined } : {}) };
}
// A PNG given as base64, as a picture keeps it (hex); or what is wrong.
function pngOf(b64: string): Record<string, string> | string {
  let bytes: string;
  try { bytes = atob(b64.replace(/\s+/g, "")); } catch { return "png: not base64"; }
  if (!bytes.startsWith("\x89PNG\r\n\x1a\n")) return "png: not a PNG";
  let hex = "";
  for (let i = 0; i < bytes.length; i++) hex += bytes.charCodeAt(i).toString(16).padStart(2, "0").toUpperCase();
  return { PNG: hex };
}
// An arrow's properties as given, as a change to it (every arrow tool and edit use it).
function arrowChange(a: ArrowIn, was: Pick<Arrow, "kind" | "style" | "orbital">): Partial<Arrow> | string {
  const kind = (a.kind as ArrowKind | undefined) ?? was.kind, change: Partial<Arrow> = {};
  if (a.kind) change.kind = kind;
  if (a.style) change.style = a.style === "plain" ? undefined : a.style;
  if (a.start) change.start = a.start;
  if (a.end) change.end = a.end;
  if (a.head) change.head = a.head === "solid" ? undefined : a.head;
  if (a.head_size) change.headSize = typeof a.head_size === "string" ? sizedHead({ kind, style: a.style === "plain" ? undefined : a.style ?? was.style }, a.head_size) : a.head_size;
  if (a.bend !== undefined) change.bend = a.bend || undefined;
  if (a.ratio !== undefined) change.ratio = a.ratio === 1 ? undefined : a.ratio;
  if (a.shaft !== undefined) change.shaft = a.shaft;
  if (a.line_width !== undefined) change.width = a.line_width;
  if (a.fill) change.fill = a.fill === "none" ? undefined : a.fill;
  if (a.orbital_shape || a.orbital_phase || kind === "orbital") {
    if (kind !== "orbital") return "orbital_shape and orbital_phase go on an orbital";
    const o = { shape: a.orbital_shape ?? was.orbital?.shape ?? "p", phase: a.orbital_phase ?? was.orbital?.phase ?? "plain" };
    if (o.phase === "phased" && !["p", "d", "dz2", "hybrid"].includes(o.shape)) o.phase = "filled";
    change.orbital = o;
  }
  if (a.colour !== undefined) change.colour = a.colour === "none" ? undefined : a.colour;
  return change;
}
// A shape's properties as given, as a change to it (shape and edit use it). kind is the shape's kind after the change.
function shapeChange(a: ShapeIn, was: Partial<Shape>, kind: ShapeKind): Partial<Shape> | string {
  const change: Partial<Shape> = {}, texty = kind === "table" || kind === "tlc";
  if (a.dashed !== undefined) change.dashed = a.dashed || undefined;
  // bold is the outline's width on a box, oval or brackets; on a table or plate it is the text's, as the Text menu.
  if (a.bold !== undefined) { if (texty) change.bold = a.bold || undefined; else change.boldLine = a.bold || undefined; }
  if (a.fill) change.fill = a.fill === "none" ? undefined : a.fill;
  if (a.shadow !== undefined) change.shadow = a.shadow || undefined;
  if (a.mark !== undefined) change.mark = clean(a.mark) || undefined;
  if (a.radius !== undefined) change.radius = a.radius;
  if (a.line_width !== undefined) change.width = a.line_width;
  if (a.bracket_side) change.side = a.bracket_side === "both" ? undefined : a.bracket_side;
  if (a.usage || a.bracket_label !== undefined) change.polymer = { ...(was.polymer ?? { usage: "sru" as const }), ...(a.usage ? { usage: a.usage } : {}), ...(a.bracket_label !== undefined ? { label: clean(a.bracket_label) || undefined } : {}) };
  if (a.shade_depth !== undefined || a.shade_blur !== undefined || a.shade_opacity !== undefined) change.shade = { ...SHADE, ...was.shade, ...(a.shade_depth !== undefined ? { depth: a.shade_depth } : {}), ...(a.shade_blur !== undefined ? { blur: a.shade_blur } : {}), ...(a.shade_opacity !== undefined ? { opacity: a.shade_opacity } : {}) };
  if (a.table) { if (kind !== "table") return "table goes on a table"; change.table = tableOf(a.table, was.table); }
  if (a.tlc) { if (kind !== "tlc") return "tlc goes on a TLC plate"; change.tlc = tlcOf(a.tlc, was.tlc); }
  if (a.png) { if (kind !== "picture") return "png goes on a picture"; const p = pngOf(a.png); if (typeof p === "string") return p; change.picture = p; }
  if (a.rgroup !== undefined) change.rgroup = a.rgroup.trim() ? { ...was.rgroup, name: clean(a.rgroup) } : undefined;
  if (a.colour !== undefined) change.colour = a.colour === "none" ? undefined : a.colour;
  return change;
}
// Each property goes on every id it fits (consistency pillar), as the Actions panel's buttons and the menus set them:
// an atom its label, marks, enhanced stereo, label style, highlight, number and query properties; a bond its kind,
// line, highlight and query properties; a structure a new structure, a number, a turn, a flip, a highlight, ring fills
// and its display settings; text its text, style, alignment, width, spacing, turn and arrow; an arrow its kind, line,
// heads, sizes and fill; a shape its kind, line, fill, shadow, sign, brackets, table, plate and picture. Colour goes
// on everything. scale and ring_fill run as the Actions panel does them, on the ids selected. The result says what
// did not fit.
async function edit(host: Host, a: Edit): Promise<Result> {
  let m = host.doc();
  const unfit: string[] = [], done: string[] = [], replaced: string[] = [], props = Object.keys(a).filter((k) => k !== "ids");
  if (!props.length) return { text: "Give a property to change (charge, bond, colour, highlight, text, kind and the rest).", error: true };
  for (const k of ["colour", "highlight", "ring_fill"] as const) if (a[k] !== undefined && a[k] !== "none" && !COLOUR.test(a[k]!)) return { text: `${k}: give #rrggbb or none, not ${a[k]}.`, error: true };
  const runs = a.runs && runsOf(a.runs);
  if (typeof runs === "string") return { text: `Octet changed nothing. ${runs}.`, error: true };
  if (runs && a.text !== undefined) return { text: "Give text or runs, not both.", error: true };
  const fits = (id: string, allowed: string[]) => { const not = props.filter((p) => !allowed.includes(p)); if (not.length) unfit.push(`${id} takes no ${not.join(", ")}`); return props.filter((p) => allowed.includes(p)); };
  const or = <T,>(on: boolean | undefined, v: T): T | undefined => (on ? v : undefined);
  const ink = a.colour === "none" ? undefined : a.colour, halo = a.highlight === "none" ? undefined : a.highlight;
  // The label style, as the Text menu on a selected label or a table's text.
  const textOf = (use: string[]) => ({
    ...(use.includes("bold") ? { bold: or(a.bold, true as const) } : {}), ...(use.includes("italic") ? { italic: or(a.italic, true as const) } : {}), ...(use.includes("underline") ? { underline: or(a.underline, true as const) } : {}),
    ...(use.includes("size") ? { size: a.size } : {}), ...(use.includes("font") ? { font: a.font ? clean(a.font) : undefined } : {}),
  });
  const STYLE = ["bold", "italic", "underline", "size", "font"];
  // scale and ring_fill go through the Actions panel's own actions, on everything they fit, once all else is done.
  const scaled = { atoms: new Set<number>(), items: new Set<number>() }, filled = new Set<number>();
  for (const id of a.ids) {
    const bond = bondOf(m, id, host), atom = bond === undefined ? atomOf(m, id, host) : undefined, structure = atom === undefined && bond === undefined ? structureOf(m, id, host) : undefined;
    const n = Number(/^[tac](\d+)$/.exec(id)?.[1]), caption = m.captions?.find((c) => c.id === n && id.startsWith("t")), arrow = m.arrows?.find((x) => x.id === n && id.startsWith("a")), shape = m.shapes?.find((x) => x.id === Number(/^b(\d+)$/.exec(id)?.[1]));
    if (atom !== undefined) {
      const use = fits(id, ["label", "runs", "charge", "isotope", "radical", "lone_pairs", "bars", "enhanced", "align", "colour", "highlight", "atom_number", "hidden", "chemical", "label_angle", "query", "scale", "ring_fill", "ignore_warnings", ...STYLE]);
      if (use.includes("label") && a.label!.trim()) m = setLabel(m, atom, clean(a.label!));
      if (use.includes("runs") && runs) { const t = plain(runs); m = setLabel(m, atom, t); m = { ...m, atoms: m.atoms.map((x, k) => (k === atom ? { ...x, text: t, runs } : x)) }; }
      const change: Partial<Atom> = textOf(use);
      if (use.includes("charge")) change.charge = Math.max(-8, Math.min(8, Math.round(a.charge!))) || undefined;
      if (use.includes("isotope")) change.isotope = a.isotope! >= 1 && a.isotope! <= 300 ? Math.round(a.isotope!) : undefined;
      if (use.includes("radical")) change.radical = RADICALS.indexOf(a.radical!) || undefined;
      if (use.includes("lone_pairs")) change.pairs = Math.max(0, Math.min(4, Math.round(a.lone_pairs!))) || undefined;
      if (use.includes("bars")) change.bars = or(a.bars, true as const);
      if (use.includes("colour")) change.colour = ink;
      if (use.includes("highlight")) change.halo = halo;
      if (use.includes("atom_number")) change.number = clean(a.atom_number!) || undefined;
      if (use.includes("hidden")) change.hidden = or(a.hidden, true as const);
      if (use.includes("chemical")) change.chemical = a.chemical ? undefined : false;
      if (use.includes("label_angle")) change.labelAngle = a.label_angle || undefined;
      if (use.includes("ignore_warnings")) change.ignoreWarnings = or(a.ignore_warnings, true as const);
      if (use.includes("query")) {
        const q = a.query!, query: AtomQuery = { ...(q.substituents ? { subst: { kind: q.substituents, n: q.n ?? 0 } } : {}), ...(q.no_h ? { noH: true as const } : {}), ...(q.rings ? { rings: q.rings } : {}), ...(q.unsaturation ? { unsat: q.unsaturation } : {}), ...(q.change ? { change: true as const } : {}), ...(q.stereo ? { stereo: q.stereo } : {}), ...(q.valence ? { valence: true as const } : {}) };
        change.query = Object.keys(query).length ? query : undefined;
      }
      // A label's alignment, as Text > Alignment on a label: auto reads away from the bonds.
      if (use.includes("align")) { if (a.align === "justify") unfit.push(`${id} takes no align justify`); else change.align = a.align === "auto" ? undefined : (a.align as Atom["align"]); }
      m = { ...m, atoms: m.atoms.map((x, k) => (k === atom ? { ...x, ...change } : x)) };
      if (use.includes("enhanced")) m = setEnhanced(m, [atom], a.enhanced || undefined);
      if (use.includes("scale")) scaled.atoms.add(atom);
      if (use.includes("ring_fill")) filled.add(atom);
    } else if (bond !== undefined) {
      const use = fits(id, ["bond", "colour", "highlight", "position", "spacing", "topology", "reaction_centre", "bond_query", "ignore_warnings"]);
      if (use.includes("bond")) m = setBondSpec(m, bond, BONDS[a.bond!].spec);
      const change: Partial<Mol["bonds"][number]> = {};
      if (use.includes("colour")) change.colour = ink;
      if (use.includes("highlight")) change.halo = halo;
      if (use.includes("position")) change.position = a.position === "auto" ? undefined : a.position;
      if (use.includes("spacing")) change.spacing = a.spacing;
      if (use.includes("topology")) change.topology = a.topology === "none" ? undefined : a.topology;
      if (use.includes("reaction_centre")) change.rxn = a.reaction_centre === "none" ? undefined : a.reaction_centre;
      if (use.includes("bond_query")) change.query = a.bond_query === "none" ? undefined : a.bond_query;
      if (use.includes("ignore_warnings")) change.ignoreWarnings = or(a.ignore_warnings, true as const);
      m = { ...m, bonds: m.bonds.map((b, k) => (k === bond ? { ...b, ...change } : b)) };
    } else if (structure) {
      const use = fits(id, ["structure", "changes", "number", "colour", "highlight", "ring_fill", "rotate", "scale", "flip", "perspective", "stereo_labels", "atom_numbers", "aromatic_circles", "ignore_warnings", ...STYLE]), set = new Set(structure);
      const each: Partial<Atom> = textOf(use);
      if (use.includes("colour")) each.colour = ink;
      if (use.includes("highlight")) each.halo = halo;
      if (use.includes("perspective")) each.shade = or(a.perspective, true as const);
      if (use.includes("stereo_labels")) each.cip = or(a.stereo_labels, true as const);
      if (use.includes("aromatic_circles")) each.circle = or(a.aromatic_circles, true as const);
      if (use.includes("ignore_warnings")) each.ignoreWarnings = or(a.ignore_warnings, true as const);
      m = { ...m, atoms: m.atoms.map((x, k) => (set.has(k) ? { ...x, ...each, ...(use.includes("atom_numbers") ? { number: a.atom_numbers ? String(structure.indexOf(k) + 1) : undefined } : {}) } : x)), bonds: m.bonds.map((b) => (set.has(b.atoms[0]) && set.has(b.atoms[1]) ? { ...b, ...(use.includes("colour") ? { colour: ink } : {}), ...(use.includes("highlight") ? { halo } : {}), ...(use.includes("ignore_warnings") ? { ignoreWarnings: or(a.ignore_warnings, true as const) } : {}) } : b)) };
      if (use.includes("rotate") && a.rotate) m = rotateAtoms(m, set, a.rotate);
      if (use.includes("flip")) m = flipAtoms(m, set, a.flip!, false);
      if (use.includes("scale")) structure.forEach((i) => scaled.atoms.add(i));
      if (use.includes("ring_fill")) structure.forEach((i) => filled.add(i));
      if (use.includes("number")) { m = host.set(m); await setNumber(host, { structure: id, number: a.number! }); m = host.doc(); }
      if (use.includes("structure") || use.includes("changes")) { m = host.set(m); const r = await replaceStructure(host, { structure: id, text: a.structure, changes: a.changes }); if (r.error) return r; replaced.push(r.text.slice(0, -UNDO.length)); m = host.doc(); }
    } else if (caption) {
      const use = fits(id, ["text", "runs", "align", "colour", "width", "line_height", "arrow", "side", "chemical", "rotate", "scale", ...STYLE]);
      const change: Partial<Caption> = textOf(use);
      if (use.includes("text")) Object.assign(change, { text: clean(a.text!, true), runs: undefined });
      if (use.includes("runs") && runs) Object.assign(change, { text: plain(runs), runs });
      if (use.includes("align")) { if (a.align === "above" || a.align === "below" || a.align === "auto") unfit.push(`${id} takes no align ${a.align}`); else change.align = a.align as Caption["align"]; }
      if (use.includes("colour")) change.colour = ink;
      if (use.includes("width")) change.width = a.width;
      if (use.includes("line_height")) change.lineHeight = a.line_height === "auto" ? undefined : a.line_height;
      if (use.includes("chemical")) change.chemical = a.chemical ? undefined : false;
      if (use.includes("rotate")) change.angle = ((caption.angle ?? 0) + a.rotate!) % 360 || undefined;
      // On an arrow as its conditions, or freed where it is drawn.
      if (use.includes("arrow") || use.includes("side")) {
        const want = a.arrow ?? (caption.on ? `a${caption.on.arrow}` : "none");
        if (want === "none") { const b = host.textBox(caption.id); Object.assign(change, { on: undefined, placed: undefined, ...(b ? { x: mid(b)[0], y: mid(b)[1] } : {}) }); }
        else {
          const k = Number(/^a(\d+)$/.exec(want)?.[1]), ar = m.arrows?.find((x) => x.id === k);
          if (!ar || !straightArrow(ar)) return { text: `There is no reaction arrow ${want} to put ${id} on.`, error: true };
          Object.assign(change, { on: { arrow: k, side: a.side ?? caption.on?.side ?? "above" }, placed: undefined, under: undefined, x: (ar.from[0] + ar.to[0]) / 2, y: (ar.from[1] + ar.to[1]) / 2 });
        }
      }
      m = updateCaption(m, caption.id, change);
      if (use.includes("scale")) scaled.items.add(caption.id);
    } else if (arrow) {
      const use = fits(id, ["kind", "style", "start", "end", "head", "head_size", "bend", "ratio", "shaft", "line_width", "fill", "orbital_shape", "orbital_phase", "colour", "from", "to", "rotate", "scale"]);
      if (use.includes("kind") && !ARROW_KINDS_IN.includes(a.kind!)) { unfit.push(`${id} takes no kind ${a.kind}`); }
      const change = arrowChange({ ...Object.fromEntries(use.map((k) => [k, a[k as keyof Edit]])), ...(use.includes("kind") && !ARROW_KINDS_IN.includes(a.kind!) ? { kind: undefined } : {}) } as ArrowIn, arrow);
      if (typeof change === "string") return { text: `${id}: ${change}.`, error: true };
      if (use.includes("from")) change.from = [a.from![0], a.from![1]];
      if (use.includes("to")) change.to = [a.to![0], a.to![1]];
      if (use.includes("rotate") && a.rotate) { const c = mid(arrowBox(arrow)), r = (a.rotate * Math.PI) / 180, turn = (p: P): P => [c[0] + (p[0] - c[0]) * Math.cos(r) - (p[1] - c[1]) * Math.sin(r), c[1] + (p[0] - c[0]) * Math.sin(r) + (p[1] - c[1]) * Math.cos(r)]; change.from = turn(change.from ?? arrow.from); change.to = turn(change.to ?? arrow.to); }
      m = updateArrow(m, arrow.id, change);
      if (use.includes("scale")) scaled.items.add(arrow.id);
    } else if (shape) {
      const use = fits(id, ["kind", "dashed", "bold", "fill", "shadow", "shade_depth", "shade_blur", "shade_opacity", "mark", "radius", "line_width", "bracket_side", "usage", "bracket_label", "table", "tlc", "png", "rgroup", "colour", "box", "rotate", "scale", "italic", "underline", "size", "font"]);
      if (use.includes("kind") && !SHAPE_KINDS_IN.includes(a.kind!)) unfit.push(`${id} takes no kind ${a.kind}`);
      const kind = use.includes("kind") && SHAPE_KINDS_IN.includes(a.kind!) ? (a.kind as ShapeKind) : shape.kind;
      if (use.includes("box")) { const b = corners([[a.box![0], a.box![1]], [a.box![2], a.box![3]]]); if (b[2] - b[0] < 0.1 || b[3] - b[1] < 0.1) return { text: "box has no size: give [x0, y0, x1, y1] with x1 > x0 and y1 > y0.", error: true }; m = updateShape(m, shape.id, { from: [b[0], b[3]], to: [b[2], b[1]] }); }
      const change = shapeChange(Object.fromEntries(use.map((k) => [k, a[k as keyof Edit]])) as ShapeIn, shape, kind);
      if (typeof change === "string") return { text: `${id}: ${change}.`, error: true };
      // A colour made for a highlight's fill (or an outline) does not carry over between the two.
      if (kind !== shape.kind) Object.assign(change, { kind, ...((shape.kind === "highlight") !== (kind === "highlight") && change.colour === undefined ? { colour: undefined } : {}) });
      if (use.includes("rotate") && a.rotate && turns({ kind })) change.angle = ((shape.angle ?? 0) + a.rotate) % 360 || undefined;
      const texty = kind === "table" || kind === "tlc";
      if (texty) Object.assign(change, textOf(use.filter((k) => k !== "bold")));
      else for (const k of ["italic", "underline", "size", "font"]) if (use.includes(k)) unfit.push(`${id} takes no ${k}`);
      m = updateShape(m, shape.id, change);
      if (use.includes("scale")) scaled.items.add(shape.id);
    } else return { text: `There is nothing with the id ${id}. Call read (with atoms for atom and bond ids).`, error: true };
    done.push(id);
  }
  m = host.set(m);
  // The Actions panel's own actions on what they fit, selected: Scale (percent of the document style) and Ring Fill.
  for (const [on, act] of [[scaled.atoms.size || scaled.items.size, `scale.${Math.round(a.scale ?? 100)}`], [filled.size, `ringfill.${a.ring_fill}`]] as const) {
    if (!on) continue;
    host.select(act.startsWith("scale") ? [...scaled.atoms] : [...filled], act.startsWith("scale") ? [...scaled.items] : []);
    await host.settle();
    host.act(act);
    await host.settle();
  }
  if (scaled.atoms.size || scaled.items.size || filled.size) { host.select([], []); await host.settle(); }
  // A structure replaced (structure, changes): what it is now, and what its changes did to its stereocentres.
  return { text: `Changed ${done.join(", ")}: ${props.join(", ")}.${replaced.map((t) => ` ${t}`).join("")}${unfit.length ? ` Not changed: ${unfit.join("; ")}.` : ""}${UNDO}` };
}
const ARROW_KINDS_IN = ["reaction", "equilibrium", "resonance", "retro", "nogo", "hash", "dipole", "block", "curved", "fishhook", "double", "line", "arc", "orbital", "cut"];
const SHAPE_KINDS_IN = ["box", "rounded", "oval", "highlight", "brackets", "parens", "braces"];

// A point an arrow starts or ends at: an atom (s3.2), a lone pair on it (s3.2:pair, just off the atom), a bond's middle
// (s3.1-2), an object's middle (s3, t5), or a point [x, y].
function pointOf(host: Host, m: Mol, at: string | number[]): P | undefined {
  if (Array.isArray(at)) return at.length === 2 ? [at[0], at[1]] : undefined;
  const b = bondOf(m, at, host);
  if (b !== undefined) { const [p, q] = m.bonds[b].atoms.map((i) => m.atoms[i].location); return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]; }
  const i = atomOf(m, at, host);
  if (i !== undefined) { const l = m.atoms[i].location; return at.endsWith(":pair") ? [l[0], l[1] + 0.45] : [l[0], l[1]]; }
  const g = structureOf(m, at, host), box = g ? host.ink(g) : (() => { const n = Number(/^t(\d+)$/.exec(at)?.[1]); return Number.isFinite(n) ? host.textBox(n) : undefined; })();
  return box ? [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2] : undefined;
}
// An object's box (a structure or text), when the place is one.
function boxAt(host: Host, m: Mol, at: string | number[]): Box | undefined {
  if (Array.isArray(at) || bondOf(m, at, host) !== undefined || atomOf(m, at, host) !== undefined) return undefined;
  const g = structureOf(m, at, host);
  if (g) return host.ink(g);
  const n = Number(/^t(\d+)$/.exec(at)?.[1]);
  return Number.isFinite(n) ? host.textBox(n) : undefined;
}
// How far along p→q the line leaves box b (0 to 1), for an arrow drawn from an object's edge, not its middle.
function leaves(p: P, q: P, b: Box): number {
  let t = 1;
  const d = [q[0] - p[0], q[1] - p[1]];
  for (const [k, lo, hi] of [[0, b[0], b[2]], [1, b[1], b[3]]] as const) if (d[k]) t = Math.min(t, Math.max((lo - p[k]) / d[k], (hi - p[k]) / d[k]));
  return Math.max(0, t);
}
const GAP = 0.5; // bond lengths between an arrow drawn between objects and each of them

async function addArrowTool(host: Host, a: ArrowIn & { kind: ArrowKind; from: string | number[]; to: string | number[] }): Promise<Result> {
  let m = host.doc();
  const from = pointOf(host, m, a.from), to = pointOf(host, m, a.to);
  if (!from || !to) return { text: `There is no ${!from ? JSON.stringify(a.from) : JSON.stringify(a.to)} to start or end the arrow at. Give an atom (s3.2), a lone pair (s3.2:pair), a bond (s3.1-2), an object id or a point [x, y].`, error: true };
  if (Math.hypot(to[0] - from[0], to[1] - from[1]) < 0.2) return { text: "The arrow's two ends are on one place.", error: true };
  if (a.colour !== undefined && !COLOUR.test(a.colour)) return { text: `colour: give #rrggbb, not ${a.colour}.`, error: true };
  const kind = a.kind, arc = curved({ kind });
  const props = arrowChange(a, { kind });
  if (typeof props === "string") return { text: `${props}.`, error: true };
  // A straight arrow between objects goes from the edge of one to the edge of the other, a gap clear of each. An
  // orbital or a cut starts where it is told (an orbital on its nucleus).
  let [p, q] = [from, to];
  if (!arc && kind !== "orbital" && kind !== "cut") {
    const [bf, bt] = [boxAt(host, m, a.from), boxAt(host, m, a.to)], len = Math.hypot(to[0] - from[0], to[1] - from[1]), u: P = [(to[0] - from[0]) / len, (to[1] - from[1]) / len];
    if (bf) { const t = leaves(from, to, bf); p = [from[0] + (to[0] - from[0]) * t + u[0] * GAP, from[1] + (to[1] - from[1]) * t + u[1] * GAP]; }
    if (bt) { const t = leaves(to, from, bt); q = [to[0] + (from[0] - to[0]) * t - u[0] * GAP, to[1] + (from[1] - to[1]) * t - u[1] * GAP]; }
    const room = (q[0] - p[0]) * u[0] + (q[1] - p[1]) * u[1];
    if (room < 0.5) return { text: `There is no room for an arrow between ${a.from} and ${a.to} (${(room + 2 * GAP).toFixed(1)} bond lengths apart): move them apart first, by 1 bond length and 0.4 for each character of the arrow's text (move with right_of and gap).`, error: true };
  }
  let id: number;
  [m, id] = addArrow(m, { ...props, kind, from: p, to: q, ...(arc ? { bend: a.bend ?? 0.3 } : {}) });
  host.set(m);
  return { text: `Drew a${kind === "equilibrium" || kind === "arc" || kind === "orbital" ? "n" : ""} ${kind}${kind === "orbital" || kind === "cut" || kind === "line" || kind === "arc" ? "" : " arrow"} a${id} from ${JSON.stringify(a.from)} to ${JSON.stringify(a.to)}.${UNDO}` };
}
async function addShapeTool(host: Host, a: ShapeIn & { kind: ShapeKind; around?: string[]; box?: number[]; pad?: number; angle?: number }): Promise<Result> {
  let m = host.doc();
  if (!a.around === !a.box) return { text: "Give around (ids) or box ([x0, y0, x1, y1]), one of them.", error: true };
  if (a.colour !== undefined && !COLOUR.test(a.colour)) return { text: `colour: give #rrggbb, not ${a.colour}.`, error: true };
  if (a.kind === "picture" && !a.png) return { text: "A picture needs png (its PNG, base64).", error: true };
  let b: Box;
  if (a.box) {
    b = corners([[a.box[0], a.box[1]], [a.box[2], a.box[3]]]);
    if (b[2] - b[0] < 0.1 || b[3] - b[1] < 0.1) return { text: "The box has no size: give [x0, y0, x1, y1] with x1 > x0 and y1 > y0.", error: true };
  } else {
    const { unknown } = idsOf(host, m, a.around!);
    if (unknown.length) return { text: `There is nothing with the id ${unknown.join(", ")}. Call read for the ids.`, error: true };
    const pad = a.pad ?? (a.kind === "brackets" || a.kind === "parens" || a.kind === "braces" ? 0.3 : 0.5), got = boxOfIds(host, m, a.around!, pad);
    if (!got) return { text: "There is nothing drawn there to go round.", error: true };
    b = got;
  }
  // A plate's lanes by its width (as the TLC tool draws it), a table's cells 3 by 3, unless given.
  const own: Partial<Shape> = a.kind === "tlc" ? { tlc: { lanes: Math.max(1, Math.round((b[2] - b[0]) / 1.6)), spots: [] } } : a.kind === "table" ? { table: newTable(3, 3) } : {};
  const change = shapeChange(a, own, a.kind);
  if (typeof change === "string") return { text: `${change}.`, error: true };
  let id: number;
  [m, id] = addShape(m, { ...own, ...change, kind: a.kind, from: [b[0], b[3]], to: [b[2], b[1]], ...(a.angle && turns(a) ? { angle: a.angle } : {}) });
  host.set(m);
  return { text: `Drew a${a.kind === "oval" ? "n" : ""} ${a.kind === "tlc" ? "TLC plate" : a.kind} b${id} ${a.around ? `round ${a.around.join(", ")}` : `at ${rounded(b).join(", ")}`}.${UNDO}` };
}
// Octet with no window has no one to finish a dialog: the commands that open one are refused.
const NO_DIALOG = "Octet with no window has no dialogs. read with a format gives the drawing as a file.";
// run_command: ids selected first (so the command acts on them), then the command or action by its id.
const knownCommand = (id: string) => (MENU_COMMANDS as readonly string[]).includes(id.trim()) || ACTIONS.test(id.trim());
async function runCommand(host: Host, a: { command: string; ids?: string[] }): Promise<Result> {
  const id = a.command.trim(), dialog = host.dialog(id);
  if (dialog && host.windowless()) return { text: `${NO_DIALOG} Octet did not run ${id}.`, error: true };
  if (a.ids) {
    const { atoms, items, unknown } = idsOf(host, host.doc(), a.ids);
    if (unknown.length) return { text: `There is nothing with the id ${unknown.join(", ")}. Call read for the ids.`, error: true };
    host.select([...atoms], [...items]);
    await host.settle();
  }
  const ran = (MENU_COMMANDS as readonly string[]).includes(id) ? host.command(id) || host.act(id) : host.act(id);
  await host.settle();
  return ran ? { text: `Ran ${id}.${dialog ? " Octet shows its dialog, or a box to type in: the user finishes it." : ""}` } : { text: `Octet cannot run ${id} now.`, error: true };
}

// place_template: a library template by name (or by a word it is found by), placed by the Template tool's own code
// (edit.ts addTemplate): on an atom or bond, or below what is drawn and then where placing puts it.
async function placeTemplate(host: Host, a: { name: string; set?: string; on?: string }): Promise<Result> {
  await host.ready();
  const low = (t: string) => t.trim().toLowerCase(), sets = a.set ? LIBRARY.filter((c) => low(c.name) === low(a.set!)) : LIBRARY;
  if (!sets.length) return { text: `The library has no set ${a.set}. Its sets: ${LIBRARY.map((c) => c.name).join(", ")}.`, error: true };
  const items = sets.flatMap((c) => c.items), want = low(a.name);
  const item = items.find((t) => low(t.name) === want) ?? items.find((t) => t.also?.split(",").some((w) => low(w) === want));
  if (!item) {
    const near = items.filter((t) => low(t.name).includes(want) || t.also?.toLowerCase().includes(want)).slice(0, 8).map((t) => t.name);
    return { text: `The library has no template ${a.name}.${near.length ? ` Near: ${near.join(", ")}.` : ""}`, error: true };
  }
  let m = host.doc();
  const bond = a.on !== undefined ? bondOf(m, a.on, host) : undefined, atom = a.on !== undefined && bond === undefined ? atomOf(m, a.on, host) : undefined;
  if (a.on !== undefined && bond === undefined && atom === undefined) return { text: `No atom or bond ${a.on}.`, error: true };
  // With no atom or bond to go on: its top left where new work starts (addTemplate takes where the middle of its
  // atoms goes, or its own origin when it has none).
  const t = item.mol, b = roughBox(t), n = t.atoms.length || 1, c = t.atoms.reduce((p, x) => [p[0] + x.location[0] / n, p[1] + x.location[1] / n], [0, 0]), [x, y] = origin(host, m);
  m = host.set(addTemplate(m, t, bond !== undefined ? { bond } : atom !== undefined ? { atom } : { point: [x + c[0] - b[0], y + c[1] - b[3]] }));
  await host.settle();
  return { text: `Placed ${item.name} from ${item.category}.${UNDO}` };
}

async function addFile(host: Host, a: { text: string }): Promise<Result> {
  await host.ready();
  const add = host.file(a.text);
  if (!add || (!add.atoms.length && !add.captions?.length && !add.arrows?.length && !add.shapes?.length)) return { text: "Octet cannot read this as a drawing. Give CDXML, a MOL, SDF or RXN file, SMILES or InChI.", error: true };
  let m = host.doc();
  const b = roughBox(add), [x, y] = origin(host, m), r = insertMol(m, { ...add, style: undefined }, [x - b[0], y - b[3]]);
  m = r.mol;
  m = host.set(m);
  await host.settle();
  const groups = structuresOf(m).filter((g) => g.atoms.some((i) => r.atoms.has(i)));
  return { text: `Added a drawing of ${groups.length} structure${groups.length === 1 ? "" : "s"} (${groups.map((g) => g.id).join(", ")}) and ${r.items.size} other objects below what was drawn.${UNDO}` };
}

// ---- Placement (F3) and boxes (F2) ----

type Placement = { at?: number[]; to?: number[]; anchor?: (typeof ANCHORS)[number]; right_of?: string | string[]; left_of?: string | string[]; below?: string | string[]; above?: string | string[]; gap?: number; align?: string };
const SIDES = ["right_of", "left_of", "below", "above"] as const;
const placed = (a: Placement) => !!(a.at || a.to || SIDES.some((k) => a[k] !== undefined));
// The ids a placement is beside (one, or several: the box round them).
const beside = (a: Placement, side: (typeof SIDES)[number]) => [a[side]!].flat();
const union = (boxes: Box[]): Box | undefined => (boxes.length ? [Math.min(...boxes.map((b) => b[0])), Math.min(...boxes.map((b) => b[1])), Math.max(...boxes.map((b) => b[2])), Math.max(...boxes.map((b) => b[3]))] : undefined);
const corners = (ps: P[]): Box => [Math.min(...ps.map((p) => p[0])), Math.min(...ps.map((p) => p[1])), Math.max(...ps.map((p) => p[0])), Math.max(...ps.map((p) => p[1]))];
const arrowBox = (x: Arrow): Box => corners([x.from, x.to, ...(x.curve?.points.flatMap((q) => [q.at, ...(q.c1 ? [q.c1] : []), ...(q.c2 ? [q.c2] : [])]) ?? [])]);
const mid = (b: Box): P => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
// The box of a drawing before it is drawn (a file's, a template's): its atoms' places, its arrows and shapes, and
// the points its free text is at.
const roughBox = (t: Mol): Box => union([...(t.atoms.length ? [boxOf(t)] : []), ...(t.arrows ?? []).map(arrowBox), ...(t.shapes ?? []).map((x) => corners([x.from, x.to])), ...(t.captions ?? []).filter((c) => !c.under && !c.on && !c.cycle).map((c): Box => [c.x, c.y, c.x, c.y])]) ?? [0, 0, 0, 0];
const rounded = (b: Box) => b.map((v) => Math.round(v * 10) / 10);
// The box of what the ids name (bond lengths, y up), with what belongs to them: a structure's number, an arrow's
// conditions, a cycle's text. Each write result gives these boxes, and placement measures with them.
function boxOfIds(host: Host, m: Mol, ids: string[], pad = 0): Box | undefined {
  const { atoms, items, unknown } = idsOf(host, m, ids);
  if (unknown.length) return undefined;
  const boxes: Box[] = [];
  // An atom named on its own (s3.2) is its label as drawn (a bare carbon, a small box on its place), not its structure.
  const alone = ids.flatMap((id) => (/\.\d+(?::pair)?$/.test(id) ? [atomOf(m, id, host)] : [])).filter((i): i is number => i !== undefined);
  for (const i of alone) { const l = m.atoms[i].location; boxes.push(host.labelBox(i) ?? [l[0] - 0.25, l[1] - 0.25, l[0] + 0.25, l[1] + 0.25]); }
  const rest = [...atoms].filter((i) => !alone.includes(i)), ink = rest.length ? host.ink(rest) : undefined, whole = new Set(rest);
  if (ink) boxes.push(ink);
  // A structure's number and captions go with it, not with one of its atoms named alone.
  for (const c of m.captions ?? []) if (items.has(c.id) || c.under?.some((i) => whole.has(i)) || (c.on && items.has(c.on.arrow))) { const b = host.textBox(c.id); if (b) boxes.push(b); }
  for (const x of m.arrows ?? []) if (items.has(x.id)) boxes.push(arrowBox(x));
  for (const x of m.shapes ?? []) if (items.has(x.id)) boxes.push(corners([x.from, x.to]));
  for (const c of m.cycles ?? []) if (items.has(c.id)) boxes.push([c.centre[0] - c.radius, c.centre[1] - c.radius, c.centre[0] + c.radius, c.centre[1] + c.radius]);
  if (m.grids?.some((g) => items.has(g.arrow))) for (const t of host.tables()) if (items.has(t.arrow)) boxes.push(t.box);
  const b = union(boxes);
  return b && [b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad];
}
// What is wrong with a placement, before anything is drawn.
function placeProblem(host: Host, m: Mol, a: Placement): string | undefined {
  const point = a.to ? "to" : "at", given = [...(a.at || a.to ? [point] : []), ...SIDES.filter((k) => a[k] !== undefined)];
  if (given.length > 1) return `Give one of ${point}, right_of, left_of, below or above, not ${given.join(" and ")}.`;
  const side = SIDES.find((k) => a[k] !== undefined);
  if (!side) return undefined;
  const ids = beside(a, side), { unknown } = idsOf(host, m, ids);
  if (!boxOfIds(host, m, ids)) return `There is nothing with the id ${(unknown.length ? unknown : ids).join(", ")} to go ${side.replace("_", " ")}. Call read for the ids.`;
  const across = side === "right_of" || side === "left_of";
  if (a.align && !(across ? ["top", "middle", "bottom"] : ["left", "centre", "right"]).includes(a.align)) return `align ${across ? "beside an object is top, middle or bottom" : "below or above an object is left, centre or right"}.`;
  return undefined;
}
// How far a box b moves to go where a placement says.
function target(host: Host, m: Mol, b: Box, a: Placement): P {
  const p = a.at ?? a.to;
  if (p) {
    const an = a.anchor ?? "centre", x = an.endsWith("left") ? b[0] : an.endsWith("right") ? b[2] : mid(b)[0], y = an.startsWith("top") ? b[3] : an.startsWith("bottom") ? b[1] : mid(b)[1];
    return [p[0] - x, p[1] - y];
  }
  const side = SIDES.find((k) => a[k] !== undefined)!, r = boxOfIds(host, m, beside(a, side))!, g = a.gap ?? 1.5;
  if (side === "right_of" || side === "left_of") return [side === "right_of" ? r[2] + g - b[0] : r[0] - g - b[2], a.align === "top" ? r[3] - b[3] : a.align === "bottom" ? r[1] - b[1] : mid(r)[1] - mid(b)[1]];
  // Below or above, it stays on the page across: a wide scheme centred under a narrow structure at the margin.
  const x = a.align === "left" ? r[0] - b[0] : a.align === "right" ? r[2] - b[2] : mid(r)[0] - mid(b)[0];
  return [x + across(host.style(), [b[0] + x, b[1], b[2] + x, b[3]]), side === "below" ? r[1] - g - b[3] : r[3] + g - b[1]];
}
// An operation as a call or a batch step runs it: when it takes placement and one is given, what it made then moves
// there (one function for every operation, so each places the same way).
async function runOp(tool: Op, host: Host, a: any, ctx: Ctx): Promise<Result> {
  if (!tool.place || !placed(a)) return tool.run(host, a, ctx);
  const wrong = placeProblem(host, host.doc(), a);
  if (wrong) return { text: `Octet changed nothing. ${wrong}`, error: true };
  await host.settle();
  const was = index(host.doc()), out = await tool.run(host, a, ctx);
  if (out.error) return out;
  await host.settle();
  const m = host.doc(), made = [...index(m).keys()].filter((k) => !was.has(k)), b = made.length ? boxOfIds(host, m, made) : undefined;
  if (!b) return out;
  const d = target(host, m, b, a);
  if (Math.hypot(...d) > 1e-6) { const { atoms, items } = idsOf(host, m, made); host.set(shift(m, atoms, items, d)); await host.settle(); }
  return out;
}

// ---- Batch (F1) ----

// Text that belongs to something (a number, conditions, a cycle's text), by id: it is in that object's box and moves
// with it, so it is not a top-level object.
const ownedText = (m: Mol) => new Set((m.captions ?? []).filter((c) => c.under || c.on || c.cycle).map((c) => `t${c.id}`));
// "$2.s[0]": the first structure step 2 made; "$2.s" or "$2.made" in a list, all of them.
const REF = /^\$(\d{1,2})\.(made|s|t|a|b|c)(?:\[(\d{1,3})\])?$/;
type Made = Record<"s" | "t" | "a" | "b" | "c", string[]>;
const byKind = (ids: string[]): Made => {
  const out: Made = { s: [], t: [], a: [], b: [], c: [] };
  for (const id of ids) out[id[0] as keyof Made]?.push(id);
  for (const k of Object.keys(out) as (keyof Made)[]) out[k].sort((p, q) => Number(p.slice(1)) - Number(q.slice(1)));
  return out;
};
// Every reference in a step's arguments (the steps they name).
const refsIn = (v: unknown): number[] => (typeof v === "string" ? (REF.test(v) ? [Number(REF.exec(v)![1])] : []) : Array.isArray(v) ? v.flatMap(refsIn) : v && typeof v === "object" ? Object.values(v).flatMap(refsIn) : []);
// A step's arguments with each reference to an earlier step's ids put in; or what is wrong.
// top: each step's top-level objects (not a number or conditions, which belong to one).
// side: v is a place beside, which takes several objects (the box round them).
function resolve(v: unknown, made: Made[], top: string[][], notes: Notes, side = false): unknown {
  const ids = (t: string) => {
    const [, n, kind, at] = REF.exec(t)!, all = made[Number(n) - 1], list = kind === "made" ? [...all.s, ...all.t, ...all.a, ...all.b, ...all.c] : all[kind as keyof Made];
    if (at === undefined) return list;
    if (Number(at) >= list.length) throw new Error(`${t}: step ${n} made ${list.length} ${kind === "made" ? "objects" : { s: "structures", t: "texts", a: "arrows", b: "shapes", c: "cycles" }[kind]}`);
    return [list[Number(at)]];
  };
  if (typeof v === "string" && REF.test(v)) {
    const l = ids(v);
    if (l.length === 1) return l[0];
    // "$3.made" where one id is needed: the one top-level object step 3 made (a structure, not its number too).
    const [, n, kind, at] = REF.exec(v)!, one = kind === "made" && at === undefined ? top[Number(n) - 1] : [];
    if (one.length === 1) { note(notes, v, `Read ${v} as ${one[0]}.`); return one[0]; }
    if (side) return l;
    throw new Error(`${v} names ${l.length} objects here: give one, as ${v}[0]`);
  }
  if (Array.isArray(v)) return v.flatMap((x) => (typeof x === "string" && REF.test(x) ? ids(x) : [resolve(x, made, top, notes)]));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, resolve(x, made, top, notes, (SIDES as readonly string[]).includes(k))]));
  return v;
}
async function batch(host: Host, a: { steps: { tool: (typeof BATCHABLE)[number]; args: Record<string, unknown> }[] }, ctx: Ctx): Promise<Result> {
  const args = a.steps.map((st) => { const { picture: _, picture_size: __, ...rest } = st.args; return rest; });
  // A step that asks for a picture asks for the batch's (one picture of all it changed).
  const picture = a.steps.some((st) => st.args.picture === true), data: (() => Record<string, unknown>)[] = [];
  let full = false;
  // Every step checked before anything is drawn: its arguments against its own tool, and each reference to an
  // earlier step.
  for (const [k, st] of a.steps.entries()) {
    const wrong = wrongWith(opOf(st.tool).inputSchema, args[k], ctx.notes), late = refsIn(args[k]).find((n) => n < 1 || n > k);
    if (wrong) return { text: `Octet changed nothing. Step ${k + 1} (${st.tool}): ${wrong}.`, error: true };
    if (late !== undefined) return { text: `Octet changed nothing. Step ${k + 1} (${st.tool}) names step ${late}: a step can name only the steps before it (they count from 1).`, error: true };
  }
  const made: Made[] = [], top: string[][] = [], said: string[] = [];
  for (const [k, st] of a.steps.entries()) {
    await ctx.check();
    ctx.progress(k, a.steps.length, `Step ${k + 1} of ${a.steps.length}: ${st.tool}`);
    let given: Record<string, unknown>;
    try { given = resolve(args[k], made, top, ctx.notes) as Record<string, unknown>; } catch (e) { throw new Error(`Step ${k + 1} (${st.tool}): ${(e as Error).message}.`); }
    const wrong = wrongWith(opOf(st.tool).inputSchema, given, ctx.notes);
    if (wrong) throw new Error(`Step ${k + 1} (${st.tool}): ${wrong}.`);
    // A step that asks for detail: full asks for the batch's, as with a picture.
    if (given.detail === "full") full = true;
    delete given.detail;
    await host.settle();
    const was = index(host.doc()), out = await runOp(opOf(st.tool), host, given, ctx);
    if (out.error) throw new Error(`Step ${k + 1} (${st.tool}) failed: ${out.text}`);
    data.push(() => ({ ...out.data, ...out.extra?.() }));
    await host.settle();
    const now = host.doc(), fresh = [...index(now).keys()].filter((id) => !was.has(id)), owned = ownedText(now);
    made.push(byKind(fresh)); top.push(fresh.filter((id) => !owned.has(id)));
    said.push(`${k + 1}. ${out.text.replace(UNDO, "").replace(/ Call read[^.]*\.$/, "")}`);
  }
  return { text: `Did ${a.steps.length} step${a.steps.length > 1 ? "s" : ""} as one undo step:\n${said.join("\n")}`, extra: () => ({ steps: made.map((x, k) => ({ step: k + 1, ...Object.fromEntries(Object.entries(x).filter(([, l]) => l.length)), ...Object.fromEntries(Object.entries(data[k]()).filter(([key]) => key !== "names")) })) }), ...(picture ? { cropped: true as const } : {}), ...(full ? { full: true as const } : {}) };
}

// ---- A figure (F4) ----

type Rich = string | RunIn[];
type ItemIn = Omit<CompoundIn, "text" | "caption"> & { structure?: string; caption?: Rich; brackets?: "brackets" | "parens" | "braces"; brackets_bold?: boolean; mark?: string; colour?: string; text?: Rich };
type PanelIn = { title?: Rich; subtitle?: Rich; frame?: "none" | "line" | "fill"; fill?: string; rows: ItemIn[][] };
// Text or runs as a caption's text (and runs); or what is wrong.
function richOf(t: Rich): { text: string; runs?: TextRun[] } | string {
  if (typeof t === "string") return { text: clean(t, true) };
  const runs = runsOf(t);
  return typeof runs === "string" ? runs : { text: plain(runs), runs };
}
const PANEL_PAD = 0.8, ROW_GAP = 1.2, PANEL_GAP = 1, TITLE_GAP = 0.6, UNDER_GAP = 0.3, BRACKET_PAD = 0.3;
async function drawFigure(host: Host, a: { panels: PanelIn[]; number_under_caption?: boolean; colour_by_element?: boolean; element_colours?: Record<string, unknown>; width?: number }, ctx: Ctx): Promise<Result> {
  const items = a.panels.flatMap((p) => p.rows.flat()), isStructure = (i: ItemIn) => i.structure !== undefined || !!i.molecule || i.from !== undefined || !!i.changes;
  if (items.some((i) => isStructure(i) === (i.text !== undefined))) return { text: "Octet drew nothing. Each item takes a structure (or a molecule), or text, not both.", error: true };
  if (items.filter(isStructure).length > 60) return { text: "Octet drew nothing. A figure takes at most 60 structures: draw the rest with another call.", error: true };
  const colours = Object.entries(a.element_colours ?? {});
  const badColour = [...items.map((i) => i.colour), ...a.panels.map((p) => p.fill), ...colours.map(([, c]) => c)].find((c) => c !== undefined && (typeof c !== "string" || !COLOUR.test(c)));
  if (badColour !== undefined) return { text: `Octet drew nothing. A colour is #rrggbb, not ${String(badColour).slice(0, 20)}.`, error: true };
  if (colours.length > 40 || colours.some(([k]) => k.length > 40)) return { text: "Octet drew nothing. element_colours takes element symbols or labels (O, Si, OSiPh3), at most 40.", error: true };
  const texts = new Map<Rich, { text: string; runs?: TextRun[] }>();
  for (const t of [...a.panels.flatMap((p) => [p.title, p.subtitle]), ...items.flatMap((i) => [i.caption, i.text])]) {
    if (t === undefined) continue;
    const r = richOf(t);
    if (typeof r === "string") return { text: `Octet drew nothing. ${r}.`, error: true };
    texts.set(t, r);
  }
  const { ok, failed, wrong } = await read(host, items.filter(isStructure).map(({ structure, caption: _c, text: _t, ...i }) => ({ ...i, text: structure })), ctx);
  if (failed.length || wrong.length) return { text: `Octet drew nothing.${failedNote(failed, wrong)}`, error: true };
  const stray = colours.find(([key]) => !/^[A-Z][a-z]?$/.test(key) && !ok.some((x) => x.mol.atoms.some((y) => y.text === key || y.label === key)));
  if (stray) return { text: `Octet drew nothing. element_colours: there is no element or label ${stray[0].slice(0, 40)}.`, error: true };
  await ctx.check();
  // Laid out twice (R5): first from estimated sizes, each row drawn as it is ready at about its place, so the user sees
  // the figure build up where it will be; then measured as drawn and moved to its exact place, with its brackets and
  // frames, in one step.
  let m = host.doc();
  const [x0, y0] = origin(host, m), s = host.style(), k = 72 / 25.4 / s.bond, colourOf = new Map(colours as [string, string][]);
  const framed = (p: PanelIn) => (p.frame ?? "none") !== "none", inner = (p: PanelIn) => (framed(p) ? PANEL_PAD : 0);
  type Size = { w: number; up: number; down: number; under?: number };
  // An item's size from its boxes: a structure's ink with its number and caption under it, or a text's box.
  const sizeOf = (item: ItemIn, b: Box, n?: Box, cb?: Box): Size => {
    if (!isStructure(item)) return { w: b[2] - b[0], up: (b[3] - b[1]) / 2, down: (b[3] - b[1]) / 2 };
    const c = mid(b), bp = item.brackets ? BRACKET_PAD + 0.4 : 0;
    const under = Math.max(c[1] - b[1] + bp * 0.5, n ? c[1] - n[1] : 0), down = under + (cb ? UNDER_GAP + cb[3] - cb[1] : 0);
    return { w: Math.max(b[2] - b[0] + 2 * bp, n ? n[2] - n[0] : 0, cb ? cb[2] - cb[0] : 0), up: b[3] - c[1] + bp * 0.5, down, under };
  };
  // The panels' width: the page inside its margins, or what was given, or what the widest row needs (each item's own
  // width, 1 bond length between them). Then each head's top left (title, subtitle), each item's middle (each column
  // as wide as its item, the room left shared out evenly; captions on one line across the row), each panel's frame.
  const layout = (heads: number[][], sizes: Size[][][]) => {
    const asked = a.width ?? (pageSize(s)[0] - 30) * k, need = Math.max(...sizes.flatMap((rows, i) => rows.map((row) => row.reduce((t, x) => t + x.w, 0) + row.length + 2 * inner(a.panels[i])))), W = Math.max(asked, need);
    const tops: P[][] = [], spots: { cx: number; middle: number; under: number }[][][] = [], frames: Box[] = [];
    let top = y0;
    a.panels.forEach((p, i) => {
      const pad = inner(p), left = x0 + pad, width = W - 2 * pad;
      let y = top - pad;
      tops.push(heads[i].map((h) => { const at: P = [left, y]; y -= h + 0.15; return at; }));
      if (heads[i].length) y -= TITLE_GAP;
      spots.push(sizes[i].map((row) => {
        const up = Math.max(...row.map((x) => x.up)), middle = y - up, spare = (width - row.reduce((t, x) => t + x.w, 0)) / row.length, under = Math.max(0, ...row.map((x) => x.under ?? 0));
        let at = left;
        const out = row.map((x) => { const cx = at + (x.w + spare) / 2; at += x.w + spare; return { cx, middle, under }; });
        y = middle - Math.max(...row.map((x) => (x.under === undefined ? x.down : x.down - x.under + under))) - ROW_GAP;
        return out;
      }));
      const bottom = y + ROW_GAP - pad;
      frames.push([x0, bottom, x0 + W, top]);
      top = bottom - PANEL_GAP;
    });
    return { tops, spots, frames, W, need, asked };
  };
  // Estimated boxes, about the origin: text from its characters (a caption's em in bond lengths), a structure from its
  // atoms and the lengths of their labels.
  const em = s.captionSize / s.bond, lem = s.labelSize / s.bond;
  const textGuess = (t: Rich): Box => { const lines = texts.get(t)!.text.split("\n"), w = (Math.max(...lines.map((l) => l.length)) * 0.55 * em) / 2, h = (lines.length * 1.2 * em) / 2; return [-w, -h, w, h]; };
  const inkGuess = (mol: Mol): Box => union(mol.atoms.map((x) => { const t = x.text ?? (x.label === "C" ? "" : x.label), w = t ? (t.length * 0.55 * lem) / 2 + 0.1 : 0.1, h = t ? 0.6 * lem : 0.1; return [x.location[0] - w, x.location[1] - h, x.location[0] + w, x.location[1] + h] as Box; }))!;
  const numberGuess = (b: Box, t: string): Box => { const w = (t.length * 0.6 * em) / 2, c = mid(b)[0]; return [c - w, b[1] - 0.3 - em, c + w, b[1] - 0.3]; };
  const guessed = (() => {
    let n = 0;
    return a.panels.map((p) => p.rows.map((row) => row.map((item) => {
      if (!isStructure(item)) return sizeOf(item, textGuess(item.text!));
      const x = ok[n++], b = inkGuess(x.mol), nb = x.number ? numberGuess(b, x.number) : undefined, under = nb ?? b;
      // The caption right under the structure and the number under it: both as the number's box.
      if (a.number_under_caption && item.caption !== undefined) { const g = textGuess(item.caption), h = g[3] - g[1] + (nb ? nb[3] - nb[1] + 0.1 : 0), w = Math.max(g[2] - g[0], nb ? nb[2] - nb[0] : 0) / 2, c = mid(b)[0]; return sizeOf(item, b, [c - w, b[1] - 0.3 - h, c + w, b[1] - 0.3]); }
      return sizeOf(item, b, nb, item.caption !== undefined ? ((g) => [g[0], under[1] - UNDER_GAP - (g[3] - g[1]), g[2], under[1] - UNDER_GAP] as Box)(textGuess(item.caption)) : undefined);
    })));
  })();
  const est = layout(a.panels.map((p) => [p.title, p.subtitle].filter((t) => t !== undefined).map((t) => { const g = textGuess(t!); return g[3] - g[1]; })), guessed);
  const caption = (t: Rich, x: number, y: number, extra: Partial<Caption> = {}) => { const r = texts.get(t)!, [mol, id] = addCaption(m, { ...r, x, y, align: "centre", ...extra }); m = mol; return id; };
  type Laid = { item: ItemIn; atoms?: number[]; number?: number; caption?: number; text?: number };
  const rowCount = a.panels.reduce((t, p) => t + p.rows.length, 0);
  let next = 0, shown = 0;
  const panels: { p: PanelIn; title?: number; subtitle?: number; rows: Laid[][] }[] = [];
  for (const [i, p] of a.panels.entries()) {
    const tops = [...est.tops[i]];
    const head = (t: Rich | undefined, bold: boolean) => { if (t === undefined) return undefined; const [x, y] = tops.shift()!; return caption(t, x, y - 0.8 * em, { align: "left", ...(bold ? { bold: true } : {}) }); };
    const pl = { p, title: head(p.title, true), subtitle: head(p.subtitle, false), rows: [] as Laid[][] };
    panels.push(pl);
    for (const [r, row] of p.rows.entries()) {
      pl.rows.push(row.map((item, j): Laid => {
        const { cx, middle, under } = est.spots[i][r][j];
        if (!isStructure(item)) return { item, text: caption(item.text!, cx, middle - 0.35 * em) };
        const over = a.number_under_caption && item.caption !== undefined ? { ...texts.get(item.caption)!, x: 0, y: 0, align: "centre" as const } : undefined;
        const x = ok[next++], b = boxOf(x.mol), placed = place(m, x, cx - (b[2] - b[0]) / 2, middle, over), set = new Set(placed.atoms);
        m = placed.mol;
        const own = (c?: string) => c && { colour: c };
        m = { ...m, atoms: m.atoms.map((y, q) => (set.has(q) ? { ...y, ...(own(item.colour) ?? own(colourOf.get(y.text ?? "") ?? colourOf.get(y.label)) ?? {}) } : y)), bonds: item.colour ? m.bonds.map((y) => (set.has(y.atoms[0]) ? { ...y, colour: item.colour } : y)) : m.bonds };
        return { item, atoms: placed.atoms, number: placed.number, caption: placed.over ?? (item.caption !== undefined ? caption(item.caption, cx, middle - under - UNDER_GAP - 0.8 * em) : undefined) };
      }));
      // Shown as it is ready: the first half of the rows, then the rest (each showing is a render, so a figure of many
      // rows takes no longer than it did when it was drawn out of sight).
      if (++shown !== Math.ceil(rowCount / 2) && shown !== rowCount) continue;
      m = host.set(m);
      await host.settle();
      ctx.progress(shown, rowCount + 1, `Drew ${shown} of ${rowCount} rows`);
      await ctx.check();
    }
  }
  m = host.doc();
  // Each part's box, as drawn; the exact layout; everything moved to its place at once, with brackets round their
  // structures and each panel's frame.
  const tb = (id: number) => host.textBox(id) ?? [0, 0, 0, 0] as Box, inkOf = (l: Laid) => host.ink(l.atoms!) ?? [0, 0, 0, 0] as Box;
  const heads = (pl: (typeof panels)[number]) => [pl.title, pl.subtitle].filter((id) => id !== undefined) as number[];
  const fin = layout(panels.map((pl) => heads(pl).map((id) => { const b = tb(id); return b[3] - b[1]; })), panels.map((pl) => pl.rows.map((row) => row.map((l) => (l.text !== undefined ? sizeOf(l.item, tb(l.text)) : (a.number_under_caption && l.caption !== undefined ? sizeOf(l.item, inkOf(l), union([tb(l.caption), ...(l.number !== undefined ? [tb(l.number)] : [])])) : sizeOf(l.item, inkOf(l), l.number !== undefined ? tb(l.number) : undefined, l.caption !== undefined ? tb(l.caption) : undefined)))))));
  const { W, need, asked } = fin, to = new Map<number, P>(), shapes = new Map<Laid, number>(), frameIds: (number | undefined)[] = [];
  panels.forEach((pl, i) => {
    heads(pl).forEach((id, h) => { const b = tb(id), [left, y] = fin.tops[i][h]; to.set(id, [left - b[0], y - b[3]]); });
    pl.rows.forEach((row, r) => row.forEach((l, j) => {
      const { cx, middle, under } = fin.spots[i][r][j];
      if (l.text !== undefined) { const c = mid(tb(l.text)); to.set(l.text, [cx - c[0], middle - c[1]]); return; }
      const b = inkOf(l), c = mid(b), d: P = [cx - c[0], middle - c[1]];
      m = shift(m, new Set(l.atoms), new Set(), d);
      if (l.caption !== undefined && !a.number_under_caption) { const cb = tb(l.caption), cm = mid(cb); to.set(l.caption, [cx - cm[0], middle - under - UNDER_GAP - cb[3]]); }
      if (!l.item.brackets) return;
      let id: number;
      [m, id] = addShape(m, { kind: l.item.brackets, from: [b[0] + d[0] - BRACKET_PAD, b[3] + d[1] + BRACKET_PAD], to: [b[2] + d[0] + BRACKET_PAD, b[1] + d[1] - BRACKET_PAD], ...(l.item.mark ? { mark: clean(l.item.mark) } : {}), ...(l.item.brackets_bold ? { boldLine: true as const } : {}) });
      shapes.set(l, id);
    }));
  });
  m = { ...m, captions: m.captions?.map((c) => { const d = to.get(c.id); return d ? { ...c, x: c.x + d[0], y: c.y + d[1] } : c; }) };
  panels.forEach((pl, i) => {
    if (!framed(pl.p)) return void frameIds.push(undefined);
    const f = fin.frames[i];
    let id: number;
    [m, id] = addShape(m, { kind: "rounded", from: [f[0], f[3]], to: [f[2], f[1]], ...(pl.p.frame === "fill" ? { fill: "solid" as const, colour: pl.p.fill ?? "#EEF2F8" } : pl.p.fill ? { colour: pl.p.fill } : {}) });
    frameIds.push(id);
  });
  m = host.set(m);
  await host.settle();
  ctx.progress(rowCount + 1, rowCount + 1, "Laid out the figure");
  // Octet's own Colour by Element, on the figure's structures.
  const atoms = panels.flatMap((pl) => pl.rows.flat().flatMap((l) => l.atoms ?? []));
  if (a.colour_by_element && atoms.length) { const was = host.selection(); host.select(atoms, []); await host.settle(); host.command("colour_by_element"); await host.settle(); host.select(was.atoms, was.items); await host.settle(); }
  m = host.doc();
  const t = (id?: number) => (id === undefined ? undefined : `t${id}`);
  const figure = panels.map((pl, i) => ({
    ...(pl.title !== undefined ? { title: t(pl.title) } : {}), ...(pl.subtitle !== undefined ? { subtitle: t(pl.subtitle) } : {}), ...(frameIds[i] !== undefined ? { frame: `b${frameIds[i]}` } : {}),
    rows: pl.rows.map((row) => row.map((l) => (l.text !== undefined ? { text: t(l.text) } : { structure: sid(m, l.atoms!), ...(l.number !== undefined ? { number: t(l.number) } : {}), ...(l.caption !== undefined ? { caption: t(l.caption) } : {}), ...(shapes.has(l) ? { brackets: `b${shapes.get(l)}` } : {}) }))),
  }));
  const n = atoms.length ? ok.length : 0;
  const inside = (pageSize(s)[0] - 30) * k, r1 = (v: number) => Math.round(v * 10) / 10;
  const wider = `${need > asked + 1e-6 ? ` (wider than ${a.width ? "asked" : "the page allows"}: its rows need ${r1(need)})` : ""}${W > inside + 1e-6 ? `. The page is ${r1(inside)} bond lengths wide inside its margins: use a larger page (set_brief) or fewer items a row` : ""}`;
  return { text: `Drew a figure of ${a.panels.length} panel${a.panels.length > 1 ? "s" : ""} and ${n} structure${n === 1 ? "" : "s"}, ${Math.round(W * 10) / 10} bond lengths wide${wider}.${readAs(host, ok)}${UNDO}`, extra: () => ({ figure, names: names(host, ok) }) };
}

// ---- Layout warnings (D10) ----

// What overlaps and what runs off the page, from the boxes as drawn: structures, captions, straight arrows and reagent
// tables. Text does not overlap what it belongs to (a number its structure, conditions their arrow); a reagent table
// may not overlap its reaction's text. Computed here from the editor's boxes, so a user's canvas can show the same
// later; today only AI apps see them.
type Placed = { id: string; label: string; box: Box; of?: string; line?: true };
function placedOf(host: Host, m: Mol): Placed[] {
  const out: Placed[] = [];
  for (const s of structuresOf(m)) { const b = host.ink(s.atoms); if (b) out.push({ id: s.id, label: `structure ${s.id}`, box: b }); }
  for (const c of m.captions ?? []) {
    const b = host.textBox(c.id);
    if (b && c.text.trim()) out.push({ id: `t${c.id}`, label: `the text "${short(c.text, 30)}" (t${c.id})`, box: b, of: c.under ? sid(m, c.under) : c.on ? `a${c.on.arrow}` : c.cycle ? `c${c.cycle.cycle}` : undefined });
  }
  for (const a of m.arrows ?? []) if (straightArrow(a)) out.push({ id: `a${a.id}`, label: `arrow a${a.id}`, box: [Math.min(a.from[0], a.to[0]), Math.min(a.from[1], a.to[1]) - 0.05, Math.max(a.from[0], a.to[0]), Math.max(a.from[1], a.to[1]) + 0.05] });
  // A straight line (a panel's divider) with a little room each side, so text that only touches it counts. Lines that
  // meet lines (a wireframe) and arrows are not overlaps.
  else if (a.kind === "line" && !a.curve) out.push({ id: `a${a.id}`, label: `line a${a.id}`, line: true, box: [Math.min(a.from[0], a.to[0]) - 0.1, Math.min(a.from[1], a.to[1]) - 0.1, Math.max(a.from[0], a.to[0]) + 0.1, Math.max(a.from[1], a.to[1]) + 0.1] });
  for (const t of host.tables()) out.push({ id: `g${t.arrow}`, label: `the reagent table of a${t.arrow}`, box: t.box, of: `a${t.arrow}` });
  return out;
}
// Two boxes that lie on each other (by more than a hair).
const overlap = (p: Box, q: Box) => p[0] < q[2] - 0.05 && q[0] < p[2] - 0.05 && p[1] < q[3] - 0.05 && q[1] < p[3] - 0.05;
function layoutWarnings(host: Host, m: Mol): { message: string; ids: string[] }[] {
  const all = placedOf(host, m), out: { message: string; ids: string[] }[] = [];
  const belongs = (p: Placed, q: Placed) => p.of === q.id || q.of === p.id;
  all.forEach((p, k) => all.slice(k + 1).forEach((q) => {
    if (out.length < 30 && !belongs(p, q) && !((p.line || q.line) && (p.line || p.id.startsWith("a")) && (q.line || q.id.startsWith("a"))) && overlap(p.box, q.box)) out.push({ message: `${p.label[0].toUpperCase()}${p.label.slice(1)} overlaps ${q.label}.`, ids: [p.id, q.id] });
  }));
  // Quick start has no page (page edges off), so nothing runs off one (test plan L2).
  const s = host.style(), [w, h] = pageSize(s), k = 72 / 25.4 / s.bond, page: Box = [(-w / 2) * k, (-h / 2) * k, (w / 2) * k, (h / 2) * k];
  if (s.edges) for (const p of all) {
    const sides = [p.box[0] < page[0] - 1e-6 && "left", p.box[2] > page[2] + 1e-6 && "right", p.box[3] > page[3] + 1e-6 && "top", p.box[1] < page[1] - 1e-6 && "bottom"].filter(Boolean);
    if (sides.length && out.length < 40) out.push({ message: `${p.label[0].toUpperCase()}${p.label.slice(1)} runs past the page's ${sides.join(" and ")} edge.`, ids: [p.id] });
  }
  return out;
}
// Octet's check of its own layout (R3), for the whole drawing, in every write result: what overlaps, what runs off
// the page, and text on a bond (an atom's label on a bond not its own; a caption or free text on any bond), by id.
// "clean" when there is none, so an AI app need not look at a picture to know.
type Check = "clean" | { overlaps?: string[][]; off_page?: string[]; text_on_bonds?: string[][]; labels_overlap?: string[][]; on_shape_edges?: string[][] };
function layoutCheck(host: Host, m: Mol): Check {
  const overlaps: string[][] = [], off: string[] = [], on: string[][] = [];
  for (const w of layoutWarnings(host, m)) if (w.ids.length === 2) overlaps.push(w.ids); else off.push(w.ids[0]);
  const where = new Map<number, [string, number]>();
  for (const g of structuresOf(m)) g.atoms.forEach((i, k) => where.set(i, [g.id, k + 1]));
  const bondId = (b: Mol["bonds"][number]) => { const p = where.get(b.atoms[0]), q = where.get(b.atoms[1]); return p && q ? `${p[0]}.${p[1]}-${q[1]}` : undefined; };
  const labels = new Map(m.atoms.flatMap((_, i) => { const b = host.labelBox(i); return b ? [[i, b] as [number, Box]] : []; }));
  const texts = [
    ...[...labels].map(([i, b]) => ({ id: where.has(i) ? `${where.get(i)![0]}.${where.get(i)![1]}` : undefined, b, own: i })),
    ...(m.captions ?? []).flatMap((c) => { const b = c.text.trim() ? host.textBox(c.id) : undefined; return b ? [{ id: `t${c.id}`, b, own: -1 }] : []; }),
  ];
  // Bonds by the 2-bond-length squares they cross, so each text is tried against the bonds near it.
  const CELL = 2, grid = new Map<string, number[]>(), cells = (x0: number, y0: number, x1: number, y1: number, f: (k: string) => void) => { for (let x = Math.floor(x0 / CELL); x <= Math.floor(x1 / CELL); x++) for (let y = Math.floor(y0 / CELL); y <= Math.floor(y1 / CELL); y++) f(`${x} ${y}`); };
  const ends = (b: Mol["bonds"][number]) => [m.atoms[b.atoms[0]].location, m.atoms[b.atoms[1]].location];
  m.bonds.forEach((b, k) => { const [p, q] = ends(b); cells(Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.max(p[0], q[0]), Math.max(p[1], q[1]), (c) => { const l = grid.get(c); if (l) l.push(k); else grid.set(c, [k]); }); });
  const inside = (x: number, y: number, b: Box, e: number) => x > b[0] + e && x < b[2] - e && y > b[1] + e && y < b[3] - e;
  for (const t of texts) {
    if (!t.id || on.length >= 20) continue;
    const near = new Set<number>();
    cells(t.b[0], t.b[1], t.b[2], t.b[3], (c) => grid.get(c)?.forEach((k) => near.add(k)));
    for (const k of near) {
      const b = m.bonds[k];
      if (b.atoms.includes(t.own)) continue;
      const [p, q] = ends(b), own = b.atoms.map((i) => labels.get(i));
      // Along the bond as drawn: not where it runs inside its own atoms' labels (a bond stops at a label).
      for (let s = 1; s < 20; s++) {
        const x = p[0] + ((q[0] - p[0]) * s) / 20, y = p[1] + ((q[1] - p[1]) * s) / 20;
        if (own.some((o) => o && inside(x, y, o, 0))) continue;
        if (inside(x, y, t.b, 0.04)) { const id = bondId(b); if (id) on.push([t.id, id]); break; }
      }
      if (on.length >= 20) break;
    }
  }
  // Two atom labels of one structure on each other, or closer than 0.05 bond lengths (O on O round a crowded metal,
  // which reads as one blot). Labels of two structures that meet are in overlaps already, as their structures.
  const clash: string[][] = [], meets = (p: Box, q: Box) => p[0] < q[2] + 0.05 && q[0] < p[2] + 0.05 && p[1] < q[3] + 0.05 && q[1] < p[3] + 0.05;
  for (const g of structuresOf(m)) {
    const own = g.atoms.flatMap((i) => (labels.has(i) ? [[i, labels.get(i)!] as [number, Box]] : []));
    own.forEach(([i, p], k) => own.slice(k + 1).forEach(([j, q]) => { if (clash.length < 20 && meets(p, q)) clash.push([`${g.id}.${where.get(i)![1]}`, `${g.id}.${where.get(j)![1]}`]); }));
  }
  // Text or a structure across a shape's edge, partly in and partly out: text past an inset's box, a structure half
  // over a picture (whose white ground hides it). What lies inside a shape or holds it whole is fine, and so is a line
  // or an arrow that reaches into one.
  const edges: string[][] = [], within = (p: Box, q: Box) => p[0] >= q[0] - 0.02 && p[1] >= q[1] - 0.02 && p[2] <= q[2] + 0.02 && p[3] <= q[3] + 0.02;
  const crossed = (m.shapes ?? []).filter((x) => ["box", "rounded", "oval", "picture"].includes(x.kind)).map((x) => ({ id: `b${x.id}`, box: corners([x.from, x.to]) }));
  for (const p of crossed.length ? placedOf(host, m).filter((x) => x.id[0] === "s" || x.id[0] === "t") : []) for (const q of crossed) {
    const cut = p.box[0] < q.box[2] - 0.05 && q.box[0] < p.box[2] - 0.05 && p.box[1] < q.box[3] - 0.05 && q.box[1] < p.box[3] - 0.05;
    if (edges.length < 20 && cut && !within(p.box, q.box) && !within(q.box, p.box)) edges.push([p.id, q.id]);
  }
  if (!overlaps.length && !off.length && !on.length && !clash.length && !edges.length) return "clean";
  return { ...(overlaps.length ? { overlaps: overlaps.slice(0, 20) } : {}), ...(off.length ? { off_page: off.slice(0, 20) } : {}), ...(on.length ? { text_on_bonds: on } : {}), ...(clash.length ? { labels_overlap: clash } : {}), ...(edges.length ? { on_shape_edges: edges } : {}) };
}
// Every warning's text: Octet's chemical warnings, then the layout's.
// (A problem on an object with Display Warnings off is hidden in the window, so it is not a warning here either.)
const shownProblems = (host: Host) => host.problems().filter((p) => !p.hidden);
const warningTexts = (host: Host, m: Mol) => [...shownProblems(host).map((p) => p.message), ...layoutWarnings(host, m).map((w) => w.message)];

// ---- A step's conditions as data (3b) ----

// What a line of conditions says, when it was not given as data: each item (split at commas and semicolons) is a
// yield, temperature, time, atmosphere, solvent or catalyst by its form, else a reagent.
const SOLVENTS = new Set(["thf", "2-methf", "dmf", "dma", "dmso", "nmp", "dme", "meoh", "etoh", "iproh", "i-proh", "proh", "buoh", "t-buoh", "tbuoh", "mecn", "acetonitrile", "ch2cl2", "dcm", "dce", "chcl3", "ccl4", "toluene", "phme", "benzene", "xylene", "et2o", "ether", "mtbe", "dioxane", "1,4-dioxane", "hexane", "hexanes", "pentane", "heptane", "etoac", "acetone", "h2o", "water", "tfe", "hfip", "methanol", "ethanol", "dichloromethane", "chloroform", "diethyl ether", "ethyl acetate", "tetrahydrofuran", "dimethylformamide", "dimethyl sulfoxide"]);
function classify(host: Host, text: string, into: StepFacts & { notes?: string[] }) {
  for (const line of text.split("\n")) for (const raw of line.split(/[;,](?![^(]*\))/)) {
    const t = raw.trim();
    if (!t) continue;
    if (/^\(?\s*\d+(?:[.,]\d+)?\s*%\s*\)?(?:\s*(?:yield|ee|de|conv\.?))?$/i.test(t)) into.yield ??= t;
    else if (/(?:^-?\d+(?:\.\d+)?\s*°\s*C\b|°C|\brt\b|room temperature|\breflux\b|^-?\d+\s*K$)/i.test(t)) into.temperature = into.temperature ? `${into.temperature}, ${t}` : t;
    else if (/^(?:\d+(?:\.\d+)?\s*(?:h|hr|hrs|hours?|min|mins|minutes?|d|days?|s|sec)|overnight|o\/n)$/i.test(t)) into.time ??= t;
    else if (/^(?:N2|Ar|argon|nitrogen|air|under (?:N2|Ar|argon|nitrogen|air))$/i.test(t)) into.atmosphere ??= t;
    else if (SOLVENTS.has(reagentName(t).toLowerCase())) (into.solvents ??= []).push(t);
    else if (/\bcat\.?(?:\)|$)|\bcatalytic\b|mol\s?%/i.test(t)) (into.catalysts ??= []).push(t);
    // Words Octet reads as no compound ("then workup", "two steps") are a note.
    else if (/^[a-z][a-z\s-]*$/.test(t) && /\s/.test(t) && !host.reagent(t)) (into.notes ??= []).push(t);
    else (into.reagents ??= []).push(t);
  }
}
// A step's fields: from what an AI app gave (Caption.facts), else read from its text, each reagent, catalyst and
// solvent with Octet's formula and molar mass (or resolved: false).
// Where an AI app gave a step's conditions as data, its other lines are notes.
// The line a step's facts are drawn as (stepLines): a line edited since says something else, and is read as text.
const lineOf = (f: StepFacts) => [f.reagents?.join(", "), f.catalysts?.join(", "), [...(f.solvents ?? []), f.temperature, f.time, f.atmosphere].filter(Boolean).join(", "), f.yield].filter(Boolean).join("");
function fieldsOf(host: Host, m: Mol, arrow: number) {
  const into: StepFacts & { notes?: string[] } = {};
  // The lines top to bottom, as drawn: those above the arrow are kept bottom first.
  const on = (m.captions ?? []).filter((x) => x.on?.arrow === arrow), mine = [...on.filter((x) => x.on!.side === "above").reverse(), ...on.filter((x) => x.on!.side !== "above")];
  const facts = (c: Caption) => (c.facts && lineOf(c.facts) === c.text ? c.facts : undefined), given = mine.some(facts);
  for (const c of mine) {
    const f = facts(c);
    if (!f && given && !c.facts) { (into.notes ??= []).push(c.text); continue; }
    if (!f) { classify(host, c.text, into); continue; }
    for (const k of ["reagents", "catalysts", "solvents"] as const) if (f[k]) (into[k] ??= []).push(...f[k]!);
    for (const k of ["temperature", "time", "atmosphere", "yield"] as const) if (f[k]) into[k] ??= f[k];
  }
  const resolve = (list?: string[]) => list?.map((text) => { const r = host.reagent(text); return r ? { text, formula: r.formula, mw: Math.round(r.weight * 100) / 100, resolved: true } : { text, resolved: false }; });
  return { ...(into.reagents ? { reagents: resolve(into.reagents) } : {}), ...(into.catalysts ? { catalysts: resolve(into.catalysts) } : {}), ...(into.solvents ? { solvents: resolve(into.solvents) } : {}),
    ...(into.temperature ? { temperature: into.temperature } : {}), ...(into.time ? { time: into.time } : {}), ...(into.atmosphere ? { atmosphere: into.atmosphere } : {}), ...(into.yield ? { yield: into.yield } : {}), ...(into.notes ? { notes: into.notes } : {}) };
}

// ---- Reading the drawing back ----

// A reaction's arrow in a route, by its kind (-> for the rest).
const SIGNS: Partial<Record<ArrowKind, string>> = { equilibrium: "<=>", retro: "=>", resonance: "<->", nogo: "-/->" };
// A short result or read gives this many warnings, and more says how many it left out.
const MOST_WARNINGS = 10;
// The default read is a summary (R6): each structure's id, number, caption and formula (its SMILES when asked), each
// reaction as its route with each arrow's conditions (by the arrow's id, which text and edit take: an arrow with
// none has ""), the layout as its check, and no boxes. full: everything.
// only: read just these ids (structures, text, arrows, shapes, cycles, as numbers and names too) and the reactions and
// warnings they are in.
function summary(host: Host, m: Mol, full = false, withAtoms = false, only?: string[], smiles = false) {
  const want = only && new Set(only.flatMap((id) => { const g = structureOf(m, id, host); return g ? [sid(m, g)!] : /^g\d+$/.test(id) ? [id, `a${id.slice(1)}`] : [id]; }));
  const keep = (id?: string) => !want || (id !== undefined && want.has(id));
  const s = host.style(), groups = structuresOf(m).map((x) => x.atoms).filter((g) => keep(sid(m, g)));
  const idOf = (atoms: number[]) => sid(m, atoms);
  // An atom's id as atoms: true gives it (s3.2: its structure, then its place in it).
  const atomId = (i: number) => { const g = groups.find((x) => x.includes(i)); return g ? `${sid(m, g)}.${g.indexOf(i) + 1}` : undefined; };
  // A structure's number, its part of the drawing, and Octet's name, formula and InChI for it, each worked out once a
  // read (a summary needs the last only for a number that is on two structures).
  const once = <V,>(f: (g: number[]) => V) => { const had = new Map<number[], V>(); return (g: number[]) => (had.has(g) ? had.get(g)! : had.set(g, f(g)).get(g)!); };
  // The text under a structure, by its atoms: its number (bold), and its captions.
  const under = new Map<number, Caption[]>();
  for (const c of m.captions ?? []) for (const i of c.under ?? []) { const l = under.get(i); if (!l) under.set(i, [c]); else if (!l.includes(c)) l.push(c); }
  const underOf = once((g) => [...new Set(g.flatMap((i) => under.get(i) ?? []))]);
  const numberOf = once((g) => underOf(g).find((c) => c.bold)?.text), partOf = once((g) => pickPart(m, g)), factsOf = once((g) => about(host, partOf(g)));
  const captionOf = (g: number[]) => { const l = underOf(g), n = l.find((c) => c.bold); return l.filter((c) => c !== n).map((c) => short(c.text, 200)).join("\n") || undefined; };
  const structures = groups.map((g) => {
    const id = sid(m, g)!;
    const parts = withAtoms ? {
      atoms: g.map((i, k) => { const x = m.atoms[i]; return { id: `${id}.${k + 1}`, label: x.text ?? x.label, ...(x.charge ? { charge: x.charge } : {}), ...(x.isotope ? { isotope: x.isotope } : {}), ...(x.radical ? { radical: RADICALS[x.radical] } : {}), ...(x.pairs ? { lone_pairs: x.pairs } : {}), ...(x.enhanced ? { enhanced: x.enhanced } : {}), ...(x.colour ? { colour: x.colour } : {}), ...(x.halo ? { highlight: x.halo } : {}), ...(x.number ? { atom_number: x.number } : {}) }; }),
      bonds: m.bonds.flatMap((b) => { const [p, q] = b.atoms.map((i) => g.indexOf(i)); return p < 0 || q < 0 ? [] : [{ id: `${id}.${Math.min(p, q) + 1}-${Math.max(p, q) + 1}`, kind: bondKind(b), ...(b.colour ? { colour: b.colour } : {}), ...(b.halo ? { highlight: b.halo } : {}) }]; }),
    } : {};
    if (!full) return { id, number: numberOf(g), caption: captionOf(g), formula: host.formula(partOf(g)), ...(smiles ? { smiles: host.smiles(partOf(g)) } : {}), ...parts };
    const it = factsOf(g), src = sources.get(m.atoms[g[0]].key ?? -1), b = host.ink(g);
    return { id, smiles: it.smiles, inchi: it.inchi, inchiKey: it.key, formula: it.formula, name: it.name, ...(src ? { source: src } : {}), number: numberOf(g), atoms: g.length, box: b?.map((v) => Math.round(v * 10) / 10) , ...parts };
  });
  const text = (id: number) => m.captions?.find((c) => c.id === id)?.text;
  // (inReactions: the text of the reactions read, kept as each is read: reading a reaction again from each of its
  // arrows took most of a read's time.)
  const seen = new Set<number>(), inReactions = new Set<number>(), reactions = (m.arrows ?? []).flatMap((a) => {
    if (seen.has(a.id)) return [];
    const r = host.reaction(a.id);
    if (!r) return [];
    r.arrows.forEach((id) => seen.add(id));
    r.captions.forEach((id) => inReactions.add(id));
    const part = (st: Reaction["steps"][number]) => (st.kind === "structure" ? idOf(st.atoms) : st.kind === "text" ? text(st.id) : undefined);
    const steps: { arrow: string; before: unknown[]; above: unknown[]; below: unknown[]; fields?: unknown }[] = [];
    let before: unknown[] = [];
    for (const st of r.steps) {
      if (st.kind === "arrow") {
        const c = r.conditions.get(st.id), on = (side: "above" | "below") => { const kept = (m.captions ?? []).filter((x) => x.on?.arrow === st.id && x.on.side === side).map((x) => x.text); return [...(side === "above" ? kept.reverse() : kept), ...(c?.[side] ?? []).map(part)]; };
        steps.push({ arrow: `a${st.id}`, before, above: on("above"), below: on("below"), ...(full ? { fields: fieldsOf(host, m, st.id) } : {}) });
        before = [];
      } else if (st.kind !== "plus") before.push(part(st));
    }
    return [{ steps, products: before }];
  }).filter((r) => !want || r.steps.some((st) => keep(st.arrow) || st.before.some((x) => typeof x === "string" && keep(x))) || r.products.some((x) => typeof x === "string" && keep(x)));
  const cycles = (m.cycles ?? []).filter((c) => keep(`c${c.id}`)).map((c) => ({
    id: `c${c.id}`, clockwise: c.clockwise, intermediates: c.nodes.map((n) => (n.length ? idOf(n) : null)),
    centre: m.captions?.find((x) => x.cycle?.cycle === c.id && x.cycle.side === "centre")?.text,
    sides: (m.captions ?? []).filter((x) => x.cycle?.cycle === c.id && (x.cycle.side === "in" || x.cycle.side === "out")).map((x) => ({ id: `t${x.id}`, step: x.cycle!.step, side: x.cycle!.side, text: x.text })),
    names: (m.captions ?? []).filter((x) => x.cycle?.cycle === c.id && x.cycle.side === "name").map((x) => ({ id: `t${x.id}`, step: x.cycle!.step, text: x.text })),
  }));
  const at = (v: number) => Math.round(v * 10) / 10;
  const free = (m.captions ?? []).filter((c) => !c.on && !c.cycle && !(c.bold && c.under) && !inReactions.has(c.id) && keep(`t${c.id}`));
  // Octet's chemical warnings, the layout's (in a full read: a summary has the layout in its check), and a compound
  // number on two structures that differ (as ChemDraw numbers them, each is the drawing's own). One compound drawn
  // twice, as a scheme's product that starts the next scheme, keeps its number.
  const numbered = new Map<string, number[][]>();
  for (const g of groups) { const k = numberOf(g); if (k) numbered.set(k, [...(numbered.get(k) ?? []), g]); }
  const warned: { message: string; structure?: string; atom?: string; ids?: string[]; fix?: string }[] = [
    ...shownProblems(host).map((p) => ({ message: p.message, structure: p.atom !== undefined ? idOf([p.atom]) : undefined, ...(p.atom !== undefined ? { atom: atomId(p.atom) } : {}), ...(p.fix ? { fix: p.fix.label } : {}) })),
    ...(full ? layoutWarnings(host, m) : []),
    ...[...numbered].flatMap(([k, gs]) => (gs.length > 1 && new Set(gs.map((g) => { const it = factsOf(g); return it.key ?? it.smiles ?? sid(m, g); })).size > 1 ? [{ message: `Compound number ${k} is on more than one structure.`, structure: undefined }] : [])),
  ], warnings = want ? warned.filter((w) => keep(w.structure) || w.ids?.some(keep)) : warned;
  const sel = host.selection(), selected = [...new Set([...groups.filter((g) => g.some((i) => sel.atoms.includes(i))).map((g) => sid(m, g)!), ...sel.items.map((id) => `${m.cycles?.some((c) => c.id === id) ? "c" : m.arrows?.some((x) => x.id === id) ? "a" : "t"}${id}`)])];
  const details = host.experiment() ? detailsOf(m.annotations) : undefined;
  const box = (b?: Box) => b?.map((v) => Math.round(v * 10) / 10);
  const tables = host.tables(), grids = tables.length ? tables.map((t) => { const gr = m.grids?.find((x) => x.arrow === t.arrow); return { arrow: `a${t.arrow}`, box: box(t.box), ...(gr?.limiting ? { limiting: gr.limiting } : {}), columns: t.columns.map((c) => ({ key: c.key, what: c.what.replace(/^"(.*)"$/, "$1"), formula: c.formula, mw: Math.round(c.mw * 100) / 100, product: c.product, typed: c.typed })) }; }) : undefined;
  const head = { drawing: { id: host.window().id, title: host.window().name }, style: s.preset, page: s.page, landscape: s.landscape || undefined };
  if (!full) {
    // A compound goes by its number when that is on no other structure and is no id itself, else by its id.
    // (Counted by the numbers drawn, not by structure as numbered is: a salt's two ions under one number are one
    // compound, and go by that number.)
    const count = new Map<string, number>();
    for (const c of m.captions ?? []) if (c.bold && c.under?.length) count.set(c.text, (count.get(c.text) ?? 0) + 1);
    const named = new Map(structuresOf(m).map((x) => { const k = numberOf(x.atoms); return [x.id, k && count.get(k) === 1 && !/^[a-z]\d+$/.test(k) ? k : x.id]; }));
    const by = (l: unknown[]) => l.flatMap((x) => (typeof x === "string" ? [named.get(x) ?? x] : []));
    const some = <T,>(l: T[]) => (l.length ? l : undefined);
    // The layout by id, once (the layout's warnings say the same in words); of the ids read, when some were asked for.
    const all = layoutCheck(host, m), mine = all === "clean" ? {} : Object.fromEntries(Object.entries(all).map(([k, l]) => [k, (l as (string | string[])[]).filter((e) => [e].flat().some((id) => keep(id.replace(/\..*$/, ""))))]).filter(([, l]) => l.length));
    const data = {
      ...head, experiment: details, reagentTables: grids, structures,
      reactions: reactions.map((r) => ({
        route: [...r.steps.map((st) => `${by(st.before).join(" + ")} ${SIGNS[m.arrows!.find((x) => `a${x.id}` === st.arrow)!.kind] ?? "->"}`), by(r.products).join(" + ")].join(" ").trim(),
        conditions: Object.fromEntries(r.steps.map((st) => [st.arrow, by([...st.above, ...st.below]).join("; ")])),
      })),
      cycles: some(cycles), text: some(free.filter((c) => !c.under).map((c) => ({ id: `t${c.id}`, text: short(c.text, 200) }))),
      arrows: some((m.arrows ?? []).filter((a) => keep(`a${a.id}`) && !seen.has(a.id)).map((a) => ({ id: `a${a.id}`, kind: a.kind }))),
      shapes: some((m.shapes ?? []).filter((x) => keep(`b${x.id}`)).map((x) => ({ id: `b${x.id}`, kind: x.kind }))),
      selected: some(selected), check: Object.keys(mine).length ? mine : "clean",
      // The first warnings, each at its atom or structure.
      warnings: warnings.slice(0, MOST_WARNINGS).map(({ message, structure, atom, fix }) => ({ message, at: atom ?? structure, fix })), ...(warnings.length > MOST_WARNINGS ? { more: { warnings: warnings.length - MOST_WARNINGS } } : {}),
    };
    return withAtoms ? data : fit(data);
  }
  const captions = (m.captions ?? []).filter((c) => keep(`t${c.id}`) || (want && c.under && keep(sid(m, c.under)))).map((c) => ({ id: `t${c.id}`, text: c.text, ...(c.runs ? { runs: c.runs } : {}), box: box(host.textBox(c.id)), ...(c.under ? { of: sid(m, c.under) } : c.on ? { of: `a${c.on.arrow}`, side: c.on.side } : c.cycle ? { of: `c${c.cycle.cycle}`, role: c.cycle.side } : {}) }));
  const page = (() => { const [w, h] = pageSize(s), k = 72 / 25.4 / s.bond; return [-w / 2 * k, -h / 2 * k, w / 2 * k, h / 2 * k].map((v) => Math.round(v * 10) / 10); })();
  const shapes = (m.shapes ?? []).filter((x) => keep(`b${x.id}`)).map((x) => ({ id: `b${x.id}`, kind: x.kind, box: box([Math.min(x.from[0], x.to[0]), Math.min(x.from[1], x.to[1]), Math.max(x.from[0], x.to[0]), Math.max(x.from[1], x.to[1])]), ...(x.mark ? { mark: x.mark } : {}), ...(x.fill ? { fill: x.fill } : {}), ...(x.colour ? { colour: x.colour } : {}), ...(x.dashed ? { dashed: true } : {}), ...(x.angle ? { angle: Math.round(x.angle) } : {}), ...(x.table ? { table: x.table.cells } : {}), ...(x.tlc ? { tlc: { lanes: x.tlc.lanes, spots: x.tlc.spots.map((s) => ({ lane: s.lane, rf: s.rf })) } } : {}) }));
  return {
    ...head, pageBox: page, captions, units: "bond lengths, y up", experiment: details, reagentTables: grids, structures, reactions, cycles,
    text: free.map((c: Caption) => ({ id: `t${c.id}`, text: c.text, ...(c.runs ? { runs: c.runs } : {}), at: [at(c.x), at(c.y)] })),
    arrows: (m.arrows ?? []).filter((a) => keep(`a${a.id}`)).map((a: Arrow) => ({ id: `a${a.id}`, kind: a.kind, from: a.from.map(at), to: a.to.map(at) })),
    ...(shapes.length ? { shapes } : {}), selected, warnings,
  };
}
// No default read is over 20,000 characters (P2): while one is, its longest list loses its last half, and more says how
// many of each kind were left out, and how to read them.
const MOST_READ = 20_000;
function fit(data: Record<string, unknown>): Record<string, unknown> {
  const more: Record<string, number | string> = { ...(data.more as Record<string, number> | undefined), rest: "detail: full reads all" };
  for (let out = data; ; ) {
    if (JSON.stringify(out).length <= MOST_READ) return out;
    const lists = Object.entries(out).filter(([, v]) => Array.isArray(v) && v.length > 1) as [string, unknown[]][];
    if (!lists.length) return out;
    const [k, l] = lists.reduce((p, q) => (JSON.stringify(q[1]).length > JSON.stringify(p[1]).length ? q : p)), kept = l.length >> 1;
    more[k] = ((more[k] as number | undefined) ?? 0) + l.length - kept;
    out = { ...out, [k]: l.slice(0, kept), more };
  }
}

// ---- The protocol: JSON-RPC 2.0 messages, one at a time (MCP 2025-03-26 to 2025-11-25) ----

const VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"];
// The prompts (D13): what a chemist asks for most, each a user message that names the tools to use. Each that draws a
// scheme starts with the brief (plan 11).
const ASK = "First ask me the three questions in Octet's instructions, and call set_brief with my answers. Then ";
type PromptArg = { name: string; description: string; required?: boolean };
const PROMPTS: { name: string; title: string; description: string; arguments: PromptArg[]; text: (a: Record<string, string>) => string }[] = [
  { name: "draw_scheme", title: "Draw a scheme from text", description: "Draws the reactions in a procedure or a paragraph as one scheme", arguments: [{ name: "text", description: "The procedure or paragraph", required: true }],
    text: (a) => `${ASK}draw the reactions in this text as one scheme in Octet: one draw_route call. Give each compound its number from the text. Put reagents, catalysts, solvents, temperature, time and yield in each step's fields. Then fix what the result's warnings and check name, in one change.\n\n${a.text}` },
  { name: "redraw_picture", title: "Redraw a picture", description: "Redraws a scheme or structure from a picture you attach", arguments: [{ name: "notes", description: "What to keep or change" }],
    text: (a) => `${ASK}redraw the structures and reactions in the attached picture in Octet with draw_route for reactions, and draw: kind structures for structures, cycle for a catalytic cycle. Keep the compound numbers and the text above and below each arrow. Then call read with picture: true, compare it with the picture, and fix what is different.${a.notes ? `\n\n${a.notes}` : ""}` },
  { name: "check_drawing", title: "Check my drawing", description: "Reads the open drawing and lists what is wrong with it", arguments: [],
    text: () => "Call read with smiles: true on my open drawing. Tell me what is chemically wrong (valence, charges, stereochemistry, a reaction that is not balanced or not possible as drawn) and what is wrong with the layout. Change nothing until I say which ones to fix." },
  { name: "fill_experiment", title: "Fill in an experiment page", description: "Fills in the open experiment page from a procedure", arguments: [{ name: "procedure", description: "The procedure, with amounts", required: true }],
    text: (a) => `${ASK}fill in an experiment page in Octet from this procedure (the destination is notebook). If the open drawing is not an experiment page, call drawings with action new, for experiment. Draw the reaction (draw_route) if it is not on the page, then call advanced with tool fill_experiment, with the details and each compound's amount (and the product's measured mass, if the procedure gives it). Then call read and tell me the amounts Octet worked out.\n\n${a.procedure}` },
  { name: "journal_figure", title: "Make a journal figure", description: "Makes the open drawing ready for a journal", arguments: [{ name: "journal", description: "The journal or its style, for example ACS, RSC or Wiley", required: true }],
    text: (a) => `Make my open drawing ready as a figure for ${a.journal}. Ask me whether it goes in one column or two, and the other questions in Octet's instructions, then call set_brief with destination paper and journal ${a.journal}. Then read with picture: true, and fix what Octet warns about with change (move or arrange). When it is ready, call advanced with tool export so I can save it.` },
];

type Message = { jsonrpc?: string; id?: string | number | null; method?: string; params?: any };
let steps = 0;
let queue: Promise<unknown> = Promise.resolve();
// session: the MCP session the request came in (none for an older client); lost: the drawing the session used, now
// closed; client: the AI app's name.
// progress: sends a progress notification (JSON) on the call's event stream; cancelled: the call was cancelled.
// brief: the session's brief (set_brief), as its transport keeps it (none until set_brief); keep: keeps a new one for
// the session (mcp.rs mcp_brief), for its later calls in every drawing.
export type From = { client?: string; session?: string; lost?: string | null; progress?: (note: string) => void; cancelled?: () => boolean | Promise<boolean>; brief?: string | null; keep?: (brief: string) => unknown };

// One request from the AI app, as its JSON text; the reply's JSON text. Tool calls run one after another.
export function handle(body: string, host: () => Host, version: string, from: From = {}): Promise<string> {
  const run = queue.then(() => answer(body, host, version, from));
  queue = run.catch(() => {});
  return run;
}

// What a change made, changed and deleted (D9): each object's id with a fingerprint of it, before and after.
function index(m: Mol): Map<string, string> {
  const out = new Map<string, string>(), r = (v: number) => Math.round(v * 100);
  for (const s of structuresOf(m)) {
    const set = new Set(s.atoms);
    out.set(s.id, JSON.stringify([s.atoms.map((i) => { const a = m.atoms[i]; return [a.label, r(a.location[0]), r(a.location[1]), a.charge ?? 0, a.isotope ?? 0]; }), m.bonds.filter((b) => set.has(b.atoms[0])).map((b) => [b.type, b.stereo ?? ""])]));
  }
  for (const c of m.captions ?? []) out.set(`t${c.id}`, JSON.stringify(c));
  for (const a of m.arrows ?? []) out.set(`a${a.id}`, JSON.stringify(a));
  for (const c of m.cycles ?? []) out.set(`c${c.id}`, JSON.stringify(c));
  for (const x of m.shapes ?? []) out.set(`b${x.id}`, JSON.stringify(x));
  return out;
}
const highest = (m: Mol) => Math.max(0, ...[...(m.captions ?? []), ...(m.arrows ?? []), ...(m.shapes ?? []), ...(m.cycles ?? []), ...(m.groups ?? [])].map((x) => x.id));
const ANYWHERE = new Set(["list", "use", "new"]);
const CUT = " (cut: detail: full gives all of it)";

async function answer(body: string, host: () => Host, version: string, from: From): Promise<string> {
  let msg: Message;
  try { msg = JSON.parse(body); } catch { return reply(null, undefined, { code: -32700, message: "The request is not JSON." }); }
  const id = msg?.id ?? null;
  if (!msg || typeof msg !== "object" || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") return reply(id, undefined, { code: -32600, message: "Not a JSON-RPC 2.0 request." });
  switch (msg.method) {
    case "initialize": {
      const want = msg.params?.protocolVersion;
      return reply(id, {
        protocolVersion: VERSIONS.includes(want) ? want : VERSIONS[0], capabilities: { tools: { listChanged: false }, resources: { subscribe: true, listChanged: false }, prompts: { listChanged: false } },
        serverInfo: { name: "octet-draw", title: "Octet Draw", version, description: "Draws and reads chemical structures, reactions, schemes and catalytic cycles in the Octet Draw window open on this computer.", websiteUrl: "https://octet.software" },
        instructions: INSTRUCTIONS,
      });
    }
    case "ping": return reply(id, {});
    case "prompts/list": return reply(id, { prompts: PROMPTS.map(({ text: _, ...p }) => p) });
    case "prompts/get": {
      const p = PROMPTS.find((x) => x.name === msg.params?.name), given = msg.params?.arguments ?? {};
      if (!p) return reply(id, undefined, { code: -32602, message: `There is no prompt ${String(msg.params?.name).slice(0, 40)}. prompts/list gives the prompts.` });
      const args: Record<string, string> = {};
      for (const a of p.arguments) {
        const v = given[a.name];
        if (v !== undefined && (typeof v !== "string" || v.length > MAX_STRUCTURE)) return reply(id, undefined, { code: -32602, message: `${a.name} must be text of at most ${MAX_STRUCTURE} characters.` });
        if (a.required && !v?.trim()) return reply(id, undefined, { code: -32602, message: `The prompt ${p.name} needs ${a.name}.` });
        if (v) args[a.name] = v;
      }
      return reply(id, { description: p.description, messages: [{ role: "user", content: { type: "text", text: p.text(args) } }] });
    }
    // The drawings as resources (D12): octet://drawings lists them; octet://drawing/{id} reads one (JSON as
    // a read gives it, /cdxml, /png). mcp.rs sends a read to the window it names.
    case "resources/list": return reply(id, { resources: [
      { uri: "octet://drawings", name: "drawings", title: "Open drawings", description: "Octet's open drawings, Home's first", mimeType: "application/json" },
      ...(await host().windows()).map((w) => ({ uri: `octet://drawing/${w.id}`, name: w.id, title: w.name, description: "The drawing as read reads it", mimeType: "application/json" })),
    ] });
    case "resources/templates/list": return reply(id, { resourceTemplates: [
      { uriTemplate: "octet://drawing/{id}", name: "drawing", title: "Drawing", description: "A drawing as read reads it", mimeType: "application/json" },
      { uriTemplate: "octet://drawing/{id}/cdxml", name: "drawing-cdxml", title: "Drawing as CDXML", description: "A drawing as Export writes CDXML", mimeType: "chemical/x-cdxml" },
      { uriTemplate: "octet://drawing/{id}/png", name: "drawing-png", title: "Drawing as a picture", description: "A drawing as a PNG", mimeType: "image/png" },
    ] });
    case "resources/read": {
      const uri = msg.params?.uri, h = host();
      if (uri === "octet://drawings") return reply(id, { contents: [{ uri, mimeType: "application/json", text: JSON.stringify(await h.windows()) }] });
      const [, drawing, part] = (typeof uri === "string" && uri.length < 200 && /^octet:\/\/drawing\/([\w-]+)(?:\/(cdxml|png))?$/.exec(uri)) || [];
      if (!drawing || drawing !== h.window().id) return reply(id, undefined, { code: -32002, message: "There is no such drawing. resources/list gives the drawings." });
      await h.ready();
      await h.settle();
      if (part === "png") { const png = await h.picture(); return png ? reply(id, { contents: [{ uri, mimeType: "image/png", blob: png }] }) : reply(id, undefined, { code: -32603, message: "Octet cannot make a picture of this drawing." }); }
      if (part === "cdxml") { const text = await h.fileText("cdxml"); return text ? reply(id, { contents: [{ uri, mimeType: "chemical/x-cdxml", text }] }) : reply(id, undefined, { code: -32603, message: "Octet cannot write this drawing as CDXML." }); }
      return reply(id, { contents: [{ uri, mimeType: "application/json", text: JSON.stringify(summary(h, h.doc())) }] });
    }
    case "tools/list": return reply(id, { tools: TOOL_TABLE.map(({ hints, takes: _, ...t }) => ({ ...t, annotations: { readOnlyHint: hints.readOnly, destructiveHint: hints.destructive, idempotentHint: hints.idempotent, openWorldHint: false } })) });
    case "tools/call": {
      const named = TOOLS.find((t) => t.name === msg.params?.name), given = msg.params?.arguments ?? {};
      if (!named) return reply(id, undefined, { code: -32602, message: `There is no tool ${String(msg.params?.name).slice(0, 40)}. tools/list gives the tools.` });
      // The operation the call is, and its arguments, which are checked against that operation's own schema. A
      // refusal there names where the whole schema is: the tool lists the arguments most calls give.
      const notes: Notes = new Map(), routed = given && typeof given === "object" && !Array.isArray(given) ? named.route(given, notes) : "arguments: not an object";
      if (typeof routed === "string") return reply(id, { content: [{ type: "text", text: `Octet changed nothing. ${routed}.` }], isError: true });
      // A scheme, route, figure, cycle or grid waits for the brief (plan 3.1): the AI app asks the user first.
      if (!from.brief && needsBrief(routed.op, routed.args)) return reply(id, { content: [{ type: "text", text: BRIEF_FIRST }], isError: true });
      const tool = opOf(routed.op), args = routed.args, unfit = wrongWith(tool.inputSchema, args, notes, routed.at), wrong = unfit ?? tool.refuse?.(args);
      if (wrong) return reply(id, { content: [{ type: "text", text: `Octet changed nothing. ${wrong}.${unfit && HELP.includes(tool.name) ? ` advanced help of ${tool.name} gives its arguments.` : ""}` }], isError: true });
      // The editor's host is made again each time it draws: each call goes to the newest.
      const h = new Proxy({} as Host, { get: (_, k) => (...v: unknown[]) => (host() as any)[k](...v) });
      if (from.lost && !ANYWHERE.has(tool.name)) return reply(id, { content: [{ type: "text", text: `The drawing this session used (${from.lost}) is closed. Call drawings, then drawings with use.` }], isError: true });
      const token = msg.params?._meta?.progressToken;
      let stopped = false;
      const changes = !tool.hints.readOnly, busy = `${from.client ?? "An AI app"} is drawing.`, stop = () => { stopped = true; };
      const ctx: Ctx = {
        session: from.session, client: from.client ?? "An AI app", notes, brief: from.brief ?? undefined, keep: from.keep,
        // A call that changes the drawing also tells the window how far it is, for the user (McpMagic's pill): the
        // tool's own words, which say what it counts ("Step 2 of 3", "Drew 3 of 5 rows"). What follows a colon is for
        // the AI app (a tool's name).
        progress: (done, total, message) => { if (changes && message) h.working(busy, stop, message.split(":")[0]); if ((typeof token === "string" || typeof token === "number") && from.progress) from.progress(JSON.stringify({ jsonrpc: "2.0", method: "notifications/progress", params: { progressToken: token, progress: done, ...(total ? { total } : {}), ...(message ? { message } : {}) } })); },
        check: async () => { if (stopped || (await from.cancelled?.())) throw new Cancelled(); },
      };
      const reports = tool.outputSchema === CHANGE;
      // picture on an operation that changes the drawing is the dispatcher's (F2): the operation never sees it.
      // detail on one whose result is a change is too (R6).
      const wantPicture = changes && args.picture === true, size: keyof typeof SIZES | undefined = changes ? args.picture_size : undefined, wantFull = reports && args.detail === "full";
      if (changes) { delete args.picture; delete args.picture_size; }
      if (reports) delete args.detail;
      ctx.watched = token !== undefined;
      if (changes) { h.begin(`mcp-${++steps}`); h.working(busy, stop); }
      let before: Mol | undefined, told = false, shown: Box | undefined;
      try {
        await h.settle();
        before = h.doc();
        // (A read reports no change, and a call that changes nothing causes no warning: neither is worked out. The
        // layout's warnings are for a full result only: the call asked for one, or it is a batch, whose steps can.)
        const was = reports ? index(before) : undefined, warned = changes ? new Set(wantFull || tool.name === "batch" ? warningTexts(h, before) : shownProblems(h).map((p) => p.message)) : undefined;
        keepIdsAbove(highest(before));
        const out = await runOp(tool, h, args, ctx);
        // A tool that refuses part way (edit's structure, after a rotate) leaves nothing behind, as a throw does.
        if (out.error && changes && h.doc() !== before) h.set(before);
        // Stop, or a cancel, while the tool ran: what it did goes too.
        if (changes) await ctx.check();
        await h.settle();
        const after = h.doc();
        keepIdsAbove(highest(after));
        // A short result unless the call (or a batch's step) asked for detail: full (R6).
        const full = wantFull || !!out.full;
        // What Octet warns about now that it did not before: the chemistry, and in a full result the layout too (a
        // short one has the layout once, by id, in its check).
        const fresh = warned && !out.error ? [...new Set(full ? warningTexts(h, after) : shownProblems(h).map((p) => p.message))].filter((x) => !warned.has(x)) : [];
        let text = full && fresh.length ? `${out.text} Octet warns: ${fresh.slice(0, MOST_WARNINGS).join(" ")}` : out.text;
        // What the arguments were read as (R5), a line each, after the result (a read's text stays its JSON).
        const coerced = noted(notes);
        let structured: Record<string, unknown> | undefined = out.data, touched: string[] = [], json: string | undefined;
        if (was && !out.error) {
          const now = index(after), made = [...now.keys()].filter((k) => !was.has(k)), changed = [...now.keys()].filter((k) => was.has(k) && was.get(k) !== now.get(k));
          touched = [...made, ...changed];
          // The box of each object made (and in a full result, changed), with what belongs to it (F2), so the next
          // call can place against it without a read. Only the top-level objects': a caption that belongs to something
          // (a number, conditions, a cycle's text) is in its box already. A short result lists only those as made, 200
          // at most, and its first warnings: more says how many of each it left out.
          // What the call made comes into view when it ends: new work starts at the top of the page or under what
          // is drawn, which the window may not show.
          if (made.length) shown = boxOfIds(h, after, made);
          const owned = ownedText(after), top = (full ? touched : made).filter((k) => !owned.has(k)), listed = top.slice(0, 200);
          const boxes = Object.fromEntries(listed.flatMap((k) => { const b = boxOfIds(h, after, [k]); return b ? [[k, rounded(b)]] : []; }));
          const drawing = h.window(), check = layoutCheck(h, after), more = { ...(top.length > listed.length ? { made: top.length - listed.length } : {}), ...(fresh.length > MOST_WARNINGS ? { warnings: fresh.length - MOST_WARNINGS } : {}) };
          if (full) structured = { drawing: { id: drawing.id, title: drawing.name }, done: text, made, changed, deleted: [...was.keys()].filter((k) => !now.has(k)), ...(touched.length ? { boxes } : {}), ...out.data, ...out.extra?.(), warnings: fresh, check };
          else {
            const data = { made: listed, ...(listed.length ? { boxes } : {}), ...out.data, warnings: fresh.slice(0, MOST_WARNINGS), check, ...(Object.keys(more).length ? { more } : {}) };
            // No default reply is over MOST_READ characters (P2): a sentence longer than the room the data leaves (a
            // batch of 40 steps, each with the names Octet read another way) is cut, and says how to read all of it.
            json = JSON.stringify(data);
            const room = MOST_READ - json.length - coerced.join("\n").length - 1;
            if (text.length > room) text = `${short(text, room - CUT.length - 1)}${CUT}`;
            structured = { done: text, ...data };
          }
        }
        // The sentence once, then the data as compact JSON (without the sentence again), for AI apps that read text.
        // structuredContent holds the same, for AI apps that read that: the specification (2025-06-18 and 2025-11-25,
        // Tools, Structured Content) has a tool that gives structured content give its JSON in a text block too. An AI
        // app reads one of the two, so each holds everything, once.
        const content: unknown[] = [{ type: "text", text: reports && structured ? `${text}\n${json ?? JSON.stringify({ ...structured, done: undefined })}` : text }];
        if (coerced.length) { content.push({ type: "text", text: coerced.join("\n") }); if (structured) structured = { ...structured, coerced }; }
        // A picture of what the call made or changed, cropped to it, smaller than a read's (F2).
        const cropped = wantPicture || !!out.cropped, crop = cropped ? (touched.length ? boxOfIds(h, after, touched, 1) : undefined) : out.crop;
        if (out.picture || (cropped && !out.error)) { const png = await h.picture(out.of, crop, out.longest ?? (cropped ? (size ? SIZES[size] : 800) : 1000)); if (png) content.push({ type: "image", data: png, mimeType: "image/png" }); }
        if (tool.done && !out.error) { h.said(`${ctx.client} ${tool.done}.`); told = true; }
        return reply(id, { content, ...(structured && !out.error ? { structuredContent: structured } : {}), ...(out.error ? { isError: true } : {}) });
      } catch (e) {
        // A call that fails part way, or is cancelled, leaves nothing behind (B5): the drawing goes back as it was, in
        // the same step.
        if (changes && before && h.doc() !== before) h.set(before);
        if (e instanceof Cancelled) { told = true; h.said(`${ctx.client} stopped. The drawing is as it was.`); return reply(id, { content: [{ type: "text", text: `${named.name} was cancelled, and the drawing is as it was before the call.` }], isError: true }); }
        return reply(id, { content: [{ type: "text", text: `${named.name} did not finish, and the drawing is as it was before the call: ${e instanceof Error ? e.message : String(e)}`.slice(0, 500) }], isError: true });
      } finally {
        if (changes) { h.end(shown); if (!told) h.working(); }
      }
    }
    default: return reply(id, undefined, { code: -32601, message: `Octet does not take ${msg.method.slice(0, 40)}.` });
  }
}

// A schema as tools/list and advanced help give it (R4): without the limits Octet checks itself (lengths, counts,
// ranges; a call past one is refused and told the limit), so what an AI app reads is shorter. The enums and types
// stay. The lenient readings (numeral, also, default) are Octet's own too: an AI app is told the one form each
// argument takes. An unlisted argument is left out. An object inside is listed open, as JSON Schema has one that
// says nothing: Octet's own check is what closes it.
const UNPUBLISHED = new Set(["maxLength", "minLength", "maxItems", "minItems", "minimum", "maximum", "numeral", "also", "default", "additionalProperties", "quiet"]);
function published(x: unknown): unknown {
  if (Array.isArray(x)) return x.map(published);
  if (!x || typeof x !== "object") return x;
  const empty = (v: unknown) => (Array.isArray(v) ? !v.length : !!v && typeof v === "object" && !Object.keys(v).length);
  return Object.fromEntries(Object.entries(x).filter(([k, v]) => !UNPUBLISHED.has(k) && !((k === "required" || k === "properties") && empty(v))).map(([k, v]) => [k, k === "properties" ? Object.fromEntries(Object.entries(v as Record<string, Prop>).filter(([, p]) => !("unlisted" in p)).map(([n, p]) => [n, published(p)])) : k === "enum" && "quiet" in x ? (v as string[]).filter((e) => !(x as { quiet: string[] }).quiet.includes(e)) : published(v)]));
}
// A whole schema as it is given: its own arguments closed (additionalProperties false), so a misspelt one is seen to
// be wrong, and $defs with the pieces it refers to, each once. (No piece refers to another.)
function whole(s: ObjSchema, pieces: Record<string, Schema> = DEFS) {
  const json = JSON.stringify(s), defs = Object.entries(pieces).filter(([name]) => json.includes(`"#/$defs/${name}"`));
  return { ...(published(s) as object), additionalProperties: false, ...(defs.length ? { $defs: Object.fromEntries(defs.map(([name, x]) => [name, published(x)])) } : {}) };
}

const reply = (id: Message["id"], result?: unknown, error?: { code: number; message: string }) => JSON.stringify({ jsonrpc: "2.0", id, ...(error ? { error } : { result }) });

export const TOOL_NAMES = TOOLS.map((t) => t.name);
// The tools as tools/list gives them (D11). A tool's hints and outputSchema are made from its operations': it is
// read-only when all are, destructive when one is, idempotent when all are, and its result is a change when all are.
// (All four hints are said outright. openWorldHint is false for every tool: Octet reaches nothing outside itself.)
// takes: its schema as Octet keeps it, for checks.
export const TOOL_TABLE = TOOLS.map((t) => {
  const ops = t.ops.map(opOf);
  return { name: t.name, title: t.title, description: t.description, inputSchema: whole(t.inputSchema, t.defs), takes: t.inputSchema, outputSchema: ops.every((o) => o.outputSchema === CHANGE) ? CHANGE : { type: "object" }, hints: { readOnly: ops.every((o) => o.hints.readOnly), destructive: ops.some((o) => o.hints.destructive), idempotent: ops.every((o) => o.hints.idempotent) } };
});
// The operations, for checks.
export const OP_TABLE = OPS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema, outputSchema: t.outputSchema, hints: t.hints, done: t.done }));
