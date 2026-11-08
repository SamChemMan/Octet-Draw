// LaTeX chemfig code for a drawing's structures (Edit > Copy As > chemfig, and File > Export… as .tex): one
// \chemfig{…} that draws them as the page does. Every bond takes the absolute angle and length it has on the page, so
// any ring or layout comes out as drawn (chemfig's *n ring syntax only draws regular polygons). The structure is
// written as a tree from its leftmost atom: side chains are branches, and each bond that closes a ring is a hook
// (?[1] on the first atom, ?[1,{=}] on the second). Separate structures hang off the first one by bonds chemfig does
// not draw, so they keep their places. Lone pairs, unpaired electrons, and circled and partial charges go where the
// page draws them, with chemfig's \charge. Arrows, text and shapes are not written.
import { pieces, units } from "./labels.ts";
import { H_FIRST, HBOND, QUADRUPLE, hydrogens, markAngles, markKeys, markKinds, orderOf, type Bond, type Drawing, type Mol } from "./render.ts";
import type { DocStyle } from "./docstyle.ts";

type P = [number, number];
// chemfig's atoms of a label, the one the bonds meet (0-based), and an H stacked above or below it.
type Group = { atoms: string[]; anchor: number; stack?: "above" | "below" };

// Text chemfig reads as one atom: one capital letter at the start (outside braces) and nothing it reads as a bond,
// a branch, a ring or a hook. Anything else goes in braces, which chemfig does not split.
function atom(s: string): string {
  let plain = s, was = "";
  while (plain !== was) { was = plain; plain = plain.replace(/\{[^{}]*\}/g, ""); }
  return /^[A-Z][a-z0-9_^'.+]*$/.test(plain) || (!plain && /^\{.*\}$/.test(s)) ? s : `{${s}}`;
}
// The atoms of a group joined: chemfig starts an atom at a capital, and | starts one anywhere else.
const joined = (atoms: string[]) => atoms.map((a, k) => (k && !/^[A-Z]/.test(a) ? `|${a}` : a)).join("");
// Text in TeX's maths mode, with TeX's special characters escaped.
const tex = (s: string) => s.replace(/[\\#$%&~_^{}]/g, (c) => (c === "\\" ? "\\backslash " : c === "~" ? "\\sim " : c === "^" ? "\\hat{}" : `\\${c}`));
const sub = (n: string) => (n.length > 1 ? `_{${n}}` : `_${n}`);
const sign = (charge: number, circled?: boolean) => (circled ? (charge > 0 ? "\\oplus" : "\\ominus") : `${Math.abs(charge) > 1 ? Math.abs(charge) : ""}${charge > 0 ? "+" : "-"}`);
const num = (x: number) => String(+x.toFixed(2));
// #rrggbb as an xcolor colour, or undefined for none or black (the document's ink).
const rgb = (hex?: string) => {
  const m = hex && /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  return m && hex!.toLowerCase() !== "#000000" ? m.slice(1).map((h) => parseInt(h, 16)) : undefined;
};

// options.compact: the code on one line, as chemfig's manual writes it. Without it, an atom a line, indented by branch.
// options.page: the page's drawing of mol (render.ts: its electrons and scale), so each mark goes exactly where the
// page has it, its label's real outline counted. Without it, marks() works their places out from the bonds and labels.
export type PageMarks = Pick<Drawing, "electrons" | "scale">;
export function toChemfig(mol: Mol, style: Partial<Pick<DocStyle, "terminalLabels" | "carbonLabels" | "hideH">> = {}, options: { compact?: boolean; page?: PageMarks } = {}): string {
  const atoms = mol.atoms, kept = atoms.map((a) => !a.hidden);
  const bonds = mol.bonds.filter((b) => b.atoms.every((i) => kept[i]) && b.atoms[0] !== b.atoms[1]);
  if (!kept.some(Boolean)) return "";
  const at = (i: number): P => [atoms[i].location[0], atoms[i].location[1]];
  const nbrs: { to: number; bond: Bond }[][] = atoms.map(() => []);
  for (const b of bonds) { nbrs[b.atoms[0]].push({ to: b.atoms[1], bond: b }); nbrs[b.atoms[1]].push({ to: b.atoms[0], bond: b }); }
  const deg = (i: number) => nbrs[i].length;
  // The sum of the directions to an atom's neighbours (y up): which way its bonds go.
  const pull = (i: number): P => nbrs[i].reduce<P>((v, { to }) => { const d = [at(to)[0] - at(i)[0], at(to)[1] - at(i)[1]], l = Math.hypot(d[0], d[1]) || 1; return [v[0] + d[0] / l, v[1] + d[1] / l]; }, [0, 0]);
  // Which atoms show a label, as the page decides (render.ts).
  const labelled = atoms.map((a, i) => (a.centre ? !deg(i) : !a.attach && !a.bead && (a.label !== "C" || !deg(i) || !!a.text || !!a.isotope || !!a.shown || (deg(i) === 1 ? !!style.terminalLabels : !!style.carbonLabels))));

  // A label as chemfig's atoms. It reads away from its bonds, as on the page: H₂N and MeO where the bonds go right.
  function group(i: number): Group {
    const a = atoms[i], charge = a.charge ?? 0, v = pull(i), colour = rgb(a.colour);
    const steep = Math.hypot(v[0], v[1]) > 1e-6 && Math.abs(v[1]) > Math.abs(v[0]) * Math.tan((70 * Math.PI) / 180);
    const rtl = a.align ? a.align === "right" : deg(i) > 0 && !steep && v[0] > 1e-6;
    const tint = (g: Group): Group => (colour ? { ...g, atoms: g.atoms.map((s) => `{\\color[RGB]{${colour.join(",")}}${s}}`) } : g);
    // A skeletal carbon has no label: marks() adds its charge and its other marks.
    if (!labelled[i]) return { atoms: [], anchor: 0 };
    // A circled charge is a mark beside the label (marks()); a plain one is written after the label.
    const ch = charge && !a.circled ? `^{${sign(charge)}}` : "";
    if (a.text) {
      const us = units(a.text), order = rtl ? [...us].reverse() : us;
      const out = order.map((u) => atom(u.kind === "bracket" ? pieces(u).map((p) => tex(p.text) + (p.count ? sub(p.count) : "")).join("") : tex(u.text) + (u.count ? sub(u.count) : "")));
      if (!out.length) return { atoms: [], anchor: 0 };
      out[out.length - 1] = atom(out[out.length - 1] + ch);
      return tint({ atoms: out, anchor: rtl ? out.length - 1 : 0 });
    }
    if (a.centre) return { atoms: ["*"].map(atom), anchor: 0 };
    const used = nbrs[i].reduce((n, { bond }) => n + orderOf(bond.type), 0);
    const h = style.hideH ? 0 : a.implicitHCount ?? hydrogens(a.label, charge, used, a.radical === 3 ? 2 : a.radical);
    const el = atom((a.isotope ? `^{${a.isotope}}` : "") + tex(a.label)), hs = h ? `H${h > 1 ? sub(String(h)) : ""}` : "";
    const back = rtl || (!a.align && !deg(i) && !!h && H_FIRST.has(a.label));
    // An H the bonds leave no room for beside the atom stacks above or below it (indole's NH).
    const stack = h && (a.align === "above" || a.align === "below" ? a.align : !a.align && !back && steep && deg(i) >= 2 ? (v[1] < 0 ? "above" : "below") : undefined);
    if (stack) return tint({ atoms: [atom(`\\chem${stack}{${el}}{${hs}}${ch}`)], anchor: 0, stack });
    if (!hs) return tint({ atoms: [atom(el + ch)], anchor: 0 });
    return tint(back ? { atoms: [atom(hs), atom(el + ch)], anchor: 1 } : { atoms: [el, atom(hs + ch)], anchor: 0 });
  }
  // Lone pairs, unpaired electrons, and circled and partial charges, as chemfig's \charge round the atom its bonds
  // meet, where the page puts them (render.ts markAngles): where they were dragged, else in the widest gaps between
  // the atom's bonds, the rest of its label and its charge sign. Lewis dots and bars turn to face out (chemfig's
  // lewisautorot). A skeletal carbon's \charge, with its charge sign too, is the whole atom: chemfig joins the bonds
  // through it. The \charge is never in braces, which would hide it.
  function marks(i: number, g: Group): Group {
    const a = atoms[i], kinds = markKinds(a), skeletal = !labelled[i] && !!a.charge && !a.circled;
    if (!kinds.length && !skeletal) return g;
    // Directions in the page's frame (y down, radians), as markAngles takes them.
    const down = (q: P) => Math.atan2(-(q[1] - at(i)[1]), q[0] - at(i)[0]), v = pull(i);
    const taken = nbrs[i].map(({ to }) => down(at(to)));
    if (g.stack) taken.push(g.stack === "above" ? -Math.PI / 2 : Math.PI / 2);
    else if (g.atoms.length > 1) { if (g.anchor < g.atoms.length - 1) taken.push(0); if (g.anchor > 0) taken.push(Math.PI); }
    // A plain charge sign goes up and to the right of a label (to the left of one read backwards), or away from a
    // skeletal carbon's bonds.
    const signAt = skeletal ? Math.atan2(v[1], -v[0]) : labelled[i] && a.charge && !a.circled ? (g.anchor > 0 ? (-3 * Math.PI) / 4 : -Math.PI / 4) : undefined;
    if (signAt !== undefined) taken.push(signAt);
    const keys = markKeys(kinds), guessed = markAngles(kinds, keys, taken, a.angles);
    // Where the page drew a mark (its electrons, px with y down, about the atom at location × scale), when it is given.
    const drawn = (key: string) => {
      const e = options.page?.electrons.find((x) => x.atom === i && x.key === key), k = options.page?.scale ?? 1;
      const d = e && [e.at[0] - a.location[0] * k, e.at[1] + a.location[1] * k];
      // A mark drawn on the atom itself gives no direction: the angle is worked out instead.
      return d && Math.hypot(d[0], d[1]) > 1e-3 ? Math.atan2(d[1], d[0]) : undefined;
    };
    const ts = kinds.map((_, k) => drawn(keys[k]) ?? guessed[k]), sign0 = skeletal ? drawn("charge") ?? signAt : signAt;
    // chemfig's place for a mark: the angle in degrees anticlockwise (y up), from -179 to 180, and how far out. Dots
    // and bars sit a little clear of a label, and further from an empty atom, which has no box. A sign or δ touches
    // the place with its near side (anchor=180+\chargeangle), not its middle, so it stays off the label and bonds.
    const where = (t: number, gap: number) => {
      const d = ((Math.round((-t * 180) / Math.PI) % 360) + 360) % 360;
      return `${d > 180 ? d - 360 : d}:${gap}pt`;
    };
    const dots = (t: number) => where(t, labelled[i] ? 1 : 2), text = (t: number) => `${where(t, labelled[i] ? 0 : 1)}[anchor=180+\\chargeangle]`;
    const c = rgb(a.colour), paint = c ? `\\color[RGB]{${c.join(",")}}` : "", tikz = c ? `{rgb,255:red,${c[0]};green,${c[1]};blue,${c[2]}}` : "";
    const items = kinds.flatMap((kind, k) => {
      if (kind === "radical") return [`${dots(ts[k])}=\\.`];
      if (kind === "pair") return [`${dots(ts[k])}=${a.bars ? "\\|" : "\\:"}`];
      if (kind === "charge") return [`${text(ts[k])}=$${paint}\\scriptstyle ${sign(a.charge!, true)}$`];
      if (kind === "partial") return [`${text(ts[k])}=$${paint}\\scriptstyle\\delta^{${a.partial === "+" ? "+" : "-"}}$`];
      return []; // the query indicator: chemfig has no query properties
    });
    if (skeletal) items.unshift(`${text(sign0!)}=$${paint}\\scriptstyle ${sign(a.charge!)}$`);
    if (!items.length) return g;
    // Dots and bars in the atom's colour.
    const dotStyle = tikz ? `[.style={fill=${tikz}},|style={color=${tikz},line width=0.4pt}]` : "";
    const wrap = (content: string) => `\\charge{${dotStyle}${items.join(",")}}{${content}}`;
    if (!g.atoms.length) return { atoms: [wrap("")], anchor: 0 };
    return { ...g, atoms: g.atoms.map((s, k) => (k === g.anchor ? wrap(s) : s)) };
  }
  const groups = atoms.map((_, i) => (kept[i] ? marks(i, group(i)) : { atoms: [], anchor: 0 }));

  // Where a double bond's second line goes, as the page puts it: 1 left of atoms[0] → atoms[1], -1 right, 0 centred.
  function side(b: Bond): number {
    if (b.position) return b.position === "centre" ? 0 : b.position === "left" ? 1 : -1;
    const [p, q] = b.atoms, d: P = [at(q)[0] - at(p)[0], at(q)[1] - at(p)[1]], n: P = [-d[1], d[0]];
    const sd = (j: number) => Math.sign((at(j)[0] - at(p)[0]) * n[0] + (at(j)[1] - at(p)[1]) * n[1]);
    const ring = smallestRing(p, q);
    if (ring) {
      const c = ring.reduce<P>((s, j) => [s[0] + at(j)[0] / ring.length, s[1] + at(j)[1] / ring.length], [0, 0]);
      return Math.sign((c[0] - at(p)[0]) * n[0] + (c[1] - at(p)[1]) * n[1]);
    }
    if (deg(p) === 1 || deg(q) === 1) {
      const inner = deg(p) === 1 ? q : p, outer = inner === p ? q : p;
      return deg(inner) === 2 && !labelled[inner] ? sd(nbrs[inner].find((x) => x.to !== outer)!.to) : 0;
    }
    if (labelled[p] && labelled[q]) return 0;
    const others = [...nbrs[p].filter((x) => x.to !== q), ...nbrs[q].filter((x) => x.to !== p)];
    return Math.sign(others.reduce((s, x) => s + sd(x.to), 0)) || sd(others[0].to);
  }
  // The smallest ring (up to 8 atoms) through a bond, by a breadth-first search round it.
  function smallestRing(p: number, q: number): number[] | undefined {
    const back = new Map<number, number>([[p, -1]]), queue = [p];
    for (let k = 0; k < queue.length && !back.has(q); k++) {
      const x = queue[k];
      for (const { to, bond } of nbrs[x]) if (!back.has(to) && !(x === p && to === q) && bond.type !== HBOND) { back.set(to, x); queue.push(to); }
    }
    if (!back.has(q)) return undefined;
    const ring: number[] = [];
    for (let x = q; x !== -1; x = back.get(x)!) ring.push(x);
    return ring.length <= 8 ? ring : undefined;
  }

  let wavy = false; // a wavy bond needs a TikZ library, which the code says
  // A bond drawn from atom u: its chemfig bond character and the TikZ options that chemfig has no character for.
  function look(b: Bond, u: number): { char: string; tikz: string[] } {
    const forward = b.atoms[0] === u, tikz: string[] = [], c = rgb(b.colour);
    if (c) tikz.push(`color={rgb,255:red,${c[0]};green,${c[1]};blue,${c[2]}}`);
    // A wedge's narrow end is at atoms[0]; chemfig's < is narrow at the atom it leaves, > wide.
    const cram = (s: string) => (forward ? "<" : ">") + s;
    if (b.type === HBOND) return { char: "-", tikz: [...tikz, "dotted"] };
    if (b.type === 2) {
      const s = side(b) * (forward ? 1 : -1);
      if (b.display === "dashed" || b.display === "aromatic") tikz.push("dashed");
      return { char: s > 0 ? "=^" : s < 0 ? "=_" : "=", tikz };
    }
    if (b.type === 3 || b.type === QUADRUPLE) return { char: "~", tikz };
    if (b.stereo === 1) return { char: cram(""), tikz };
    if (b.stereo === 6) return { char: cram(":"), tikz };
    switch (b.display) {
      case "hollow": return { char: cram("|"), tikz };
      case "bold": return { char: "-", tikz: [...tikz, "line width=2pt"] };
      case "dashed": return { char: "-", tikz: [...tikz, "dashed"] };
      case "hashed": return { char: "-", tikz: [...tikz, "line width=2pt", "dash pattern=on 0.4pt off 1.2pt"] };
      case "wavy": wavy = true; return { char: "-", tikz: [...tikz, "decorate", "decoration={snake,amplitude=0.6pt,segment length=2.4pt}"] };
      case "dative": return { char: "-", tikz: [...tikz, forward ? "-stealth" : "stealth-"] };
      default: return { char: "-", tikz };
    }
  }
  const tikzOf = (t: string[]) => (t.length > 1 ? t.join(",") : t[0] ?? "");

  // A bond from u to v: its character and [angle, length, departure atom, arrival atom, TikZ]. chemfig leaves the
  // last atom of a group and meets the first of the next when the bond points right (between -90° and 90°), else the
  // reverse; the atoms are given only where that is not the label's attaching atom.
  function bondCode(u: number, v: number, char: string, tikz: string): string {
    const d: P = [at(v)[0] - at(u)[0], at(v)[1] - at(u)[1]], length = Math.hypot(d[0], d[1]);
    let angle = Math.round((Math.atan2(d[1], d[0]) * 180) / Math.PI);
    if (angle <= -180) angle += 360;
    const right = angle > -90 && angle < 90, gu = groups[u], gv = groups[v];
    const from = gu.atoms.length > 1 && gu.anchor !== (right ? gu.atoms.length - 1 : 0) ? String(gu.anchor + 1) : "";
    const to = gv.atoms.length > 1 && gv.anchor !== (right ? 0 : gv.atoms.length - 1) ? String(gv.anchor + 1) : "";
    const fields = [angle ? `:${angle}` : "", Math.abs(length - 1) > 0.02 ? num(length) : "", from, to, tikz];
    while (fields.length && !fields[fields.length - 1]) fields.pop();
    return char + (fields.length ? `[${fields.join(",")}]` : "");
  }

  // The tree each structure is written as, from its leftmost atom. Bonds chemfig has a character for that it cannot
  // write on a hook as well (wedges, double bonds) are taken first, so a ring is closed by a plain bond where it can be.
  const seen = atoms.map(() => false), children: number[][] = atoms.map(() => []), via: (Bond | undefined)[] = atoms.map(() => undefined);
  const hooks: string[][] = atoms.map(() => []), done = new Set<Bond>();
  const plain = (b: Bond) => b.type === 1 && !b.stereo && !b.display && !b.colour;
  let hookCount = 0;
  function walk(root: number) {
    const stack = [root];
    seen[root] = true;
    while (stack.length) {
      const u = stack[stack.length - 1], next = nbrs[u].filter((x) => !done.has(x.bond)).sort((x, y) => Number(plain(x.bond)) - Number(plain(y.bond)))[0];
      if (!next) { stack.pop(); continue; }
      done.add(next.bond);
      if (!seen[next.to]) { seen[next.to] = true; via[next.to] = next.bond; children[u].push(next.to); stack.push(next.to); continue; }
      // A ring closes: next.to is on the path to u, so it is written first. chemfig draws the hook's bond from there.
      const name = String(++hookCount), { char, tikz } = look(next.bond, next.to);
      hooks[next.to].push(`?[${name}]`);
      const t = tikzOf(tikz);
      const fields = [name, char === "-" ? "" : `{${char}}`, t];
      while (!fields[fields.length - 1]) fields.pop();
      hooks[u].push(`?[${fields.join(",")}]`);
    }
  }
  const order = atoms.map((_, i) => i).filter((i) => kept[i]).sort((i, j) => at(i)[0] - at(j)[0] || at(j)[1] - at(i)[1]);
  const roots: number[] = [];
  for (const i of order) if (!seen[i]) { roots.push(i); walk(i); }
  // How long a chain runs on from each atom: the longest child is written last, as the main chain, without brackets.
  const height = atoms.map(() => 0);
  for (const r of roots) (function h(u: number): number { return (height[u] = children[u].reduce((m, c) => Math.max(m, 1 + h(c)), 0)); })(r);

  const text = (i: number) => {
    const g = groups[i], hs = hooks[i].join("");
    if (!g.atoms.length) return hs;
    const out = [...g.atoms];
    out[g.anchor] += hs;
    return joined(out);
  };
  const edge = (u: number, v: number) => { const { char, tikz } = look(via[v]!, u); return bondCode(u, v, char, tikzOf(tikz)); };
  // The code as lines, each with its depth in branches: an atom with the bond to it, and each branch's brackets on
  // lines of their own. The chain runs on from atom to atom (a loop, so a long chain needs no deep recursion).
  // others: structures that hang off this atom by bonds chemfig does not draw.
  const lines: [number, string][] = [];
  function write(u: number, depth: number, lead: string, others: number[] = []) {
    for (let at = u, head = lead; ; ) {
      const line = head + text(at);
      if (line) lines.push([depth, line]);
      const kids = [...children[at]].sort((x, y) => height[x] - height[y]), last = kids.pop();
      const branch = (code: string, v: number) => { lines.push([depth, "("]); write(v, depth + 1, code); lines.push([depth, ")"]); };
      for (const r of others) branch(bondCode(at, r, "-", "draw=none"), r);
      for (const v of kids) branch(edge(at, v), v);
      if (last === undefined) return;
      [head, at, others] = [edge(at, last), last, []];
    }
  }
  write(roots[0], 0, "", roots.slice(1));
  // Compact: on one line. Readable: an atom (or bracket) a line, indented by tabs as deep as its branch. chemfig
  // ignores the spaces and line breaks between bonds and atoms, so both draw the same.
  const code = options.compact || !lines.length ? `\\chemfig{${lines.map(([, t]) => t).join("")}}` : `\\chemfig{\n${lines.map(([d, t]) => "\t".repeat(d + 1) + t).join("\n")}\n}`;
  return wavy ? `% Wavy bonds need \\usetikzlibrary{decorations.pathmorphing} in the preamble.\n${code}` : code;
}

