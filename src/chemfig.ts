// LaTeX chemfig code for a drawing's structures (Edit > Copy As > chemfig, and File > Export… as .tex): one
// \chemfig{…} that draws them as the page does. Every bond takes the absolute angle and length it has on the page, so
// any ring or layout comes out as drawn (chemfig's *n ring syntax only draws regular polygons). The structure is
// written as a tree from its leftmost atom: side chains are branches, and each bond that closes a ring is a hook
// (?[1] on the first atom, ?[1,{=}] on the second). Separate structures hang off the first one by bonds chemfig does
// not draw, so they keep their places. Arrows, text and shapes are not written.
import { pieces, units } from "./labels.ts";
import { H_FIRST, HBOND, QUADRUPLE, hydrogens, orderOf, type Bond, type Mol } from "./render.ts";
import type { DocStyle } from "./docstyle.ts";

type P = [number, number];
type Group = { atoms: string[]; anchor: number }; // chemfig's atoms of a label, and the one the bonds meet (0-based)

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

export function toChemfig(mol: Mol, style: Partial<Pick<DocStyle, "terminalLabels" | "carbonLabels" | "hideH">> = {}): string {
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
    if (!labelled[i]) {
      // A skeletal carbon's charge sits beside it, away from its bonds. chemfig joins the bonds through a \charge
      // with nothing in it, so it is the whole atom, not in braces.
      if (!charge) return { atoms: [], anchor: 0 };
      const angle = Math.round((Math.atan2(-v[1], -v[0]) * 180) / Math.PI), c = colour ? `\\color[RGB]{${colour.join(",")}}` : "";
      return { atoms: [`\\charge{${angle}:1pt=$${c}\\scriptstyle ${sign(charge, a.circled)}$}{}`], anchor: 0 };
    }
    const ch = charge ? `^{${sign(charge, a.circled)}}` : "";
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
    if (stack) return tint({ atoms: [atom(`\\chem${stack}{${el}}{${hs}}${ch}`)], anchor: 0 });
    if (!hs) return tint({ atoms: [atom(el + ch)], anchor: 0 });
    return tint(back ? { atoms: [atom(hs), atom(el + ch)], anchor: 1 } : { atoms: [el, atom(hs + ch)], anchor: 0 });
  }
  const groups = atoms.map((_, i) => (kept[i] ? group(i) : { atoms: [], anchor: 0 }));

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
  function write(u: number, extra: string[] = []): string {
    const kids = [...children[u]].sort((x, y) => height[x] - height[y]), last = kids.pop();
    const edge = (v: number) => { const { char, tikz } = look(via[v]!, u); return bondCode(u, v, char, tikzOf(tikz)) + write(v); };
    return text(u) + extra.join("") + kids.map((v) => `(${edge(v)})`).join("") + (last === undefined ? "" : edge(last));
  }
  // The other structures, each as a branch off the first by a bond chemfig does not draw.
  const others = roots.slice(1).map((r) => `(${bondCode(roots[0], r, "-", "draw=none")}${write(r)})`);
  const code = `\\chemfig{${write(roots[0], others)}}`;
  return wavy ? `% Wavy bonds need \\usetikzlibrary{decorations.pathmorphing} in the preamble.\n${code}` : code;
}

