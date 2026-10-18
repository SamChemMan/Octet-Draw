// Reaction interpretation, as ChemDraw reads a reaction (View > Show Reaction Interpretation; its stoichiometry grid
// and MDL files read reactions this way): each step of a reaction is one arrow, what stands before it in the row (its
// reactants), what stands after it (its products), and its conditions: the text kept on it, and the structures and text
// drawn above and below it. A structure between two arrows is the product of one step and a reactant of the next.
import { fragments } from "./edit.ts";
import type { Arrow, Box, Mol } from "./render.ts";
import type { Reaction, Step } from "./reaction.ts";

type P = [number, number];
export type Part = Extract<Step, { kind: "structure" | "text" }>;
export type RoleStep = { arrow: number; reactants: Part[]; products: Part[]; above: Part[]; below: Part[] };

const NEAR = 3; // how far (bond lengths) conditions sit from their arrow at most

// Each step of a reaction, in the row's order. ink: a structure's box; captionBox: a caption's box (drawing units).
export function interpret(m: Mol, r: Reaction, arrows: Arrow[], ink: (atoms: number[]) => Box | undefined, captionBox: (id: number) => Box | undefined): RoleStep[] {
  const at = r.steps.flatMap((s, k) => (s.kind === "arrow" ? [k] : []));
  const parts = (from: number, to: number) => r.steps.slice(from, to).filter((s): s is Part => s.kind === "structure" || s.kind === "text");
  // A reading that already holds the structures and text drawn by each arrow (Clean Up Reaction's) is used as it is.
  const given = (r as Reaction & { conditions?: Map<number, { above: Step[]; below: Step[] }> }).conditions;
  const taken = new Set([...r.atoms, ...r.captions.map((id) => -1 - id)]);
  return at.map((k, j) => {
    const s = r.steps[k] as Extract<Step, { kind: "arrow" }>, a = arrows.find((x) => x.id === s.id);
    const step: RoleStep = { arrow: s.id, reactants: parts(j ? at[j - 1] + 1 : 0, k), products: parts(k + 1, at[j + 1] ?? r.steps.length), above: [], below: [] };
    if (!a) return step;
    const own = given?.get(s.id);
    if (own) {
      step.above.push(...own.above.filter((x): x is Part => x.kind === "structure" || x.kind === "text"));
      step.below.push(...own.below.filter((x): x is Part => x.kind === "structure" || x.kind === "text"));
    } else {
      const d: P = [a.to[0] - a.from[0], a.to[1] - a.from[1]], length = Math.hypot(...d) || 1, u: P = [d[0] / length, d[1] / length], n: P = [-u[1], u[0]];
      const o: P = [(a.from[0] + a.to[0]) / 2, (a.from[1] + a.to[1]) / 2];
      // Above is up the page, or on the left of an arrow down the page (where text kept "above" an arrow goes).
      const up = Math.abs(u[0]) >= Math.abs(u[1]) ? Math.sign(n[1]) : -Math.sign(n[0]);
      const side = (part: Part) => {
        const b = part.box, c: P[] = [[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]];
        const along = c.map((q) => (q[0] - o[0]) * u[0] + (q[1] - o[1]) * u[1]), across = c.map((q) => (q[0] - o[0]) * n[0] + (q[1] - o[1]) * n[1]);
        const lo = Math.min(...across), hi = Math.max(...across), mid = (Math.min(...along) + Math.max(...along)) / 2;
        // Wholly on one side, near the arrow, and within its length (a structure inside its ends; text by its middle).
        const gap = lo > 0 ? lo : hi < 0 ? -hi : -1, inside = part.kind === "text" ? Math.abs(mid) <= length / 2 : Math.min(...along) >= -length / 2 - 0.25 && Math.max(...along) <= length / 2 + 0.25;
        if (gap < 0.05 || gap > NEAR || !inside) return;
        ((lo > 0 ? 1 : -1) * up > 0 ? step.above : step.below).push(part);
      };
      for (const g of fragments(m)) { const b = !taken.has(g[0]) ? ink(g) : undefined; if (b) side({ kind: "structure", atoms: g, box: b }); }
      for (const c of m.captions ?? []) {
        const b = !taken.has(-1 - c.id) && !c.under && !c.on && !c.cycle && c.text.trim() !== "+" ? captionBox(c.id) : undefined;
        if (b) side({ kind: "text", id: c.id, box: b });
      }
    }
    // Text kept on the arrow.
    for (const c of m.captions ?? []) {
      const b = c.on?.arrow === s.id ? captionBox(c.id) : undefined;
      if (b) (c.on!.side === "above" ? step.above : step.below).push({ kind: "text", id: c.id, box: b });
    }
    return step;
  });
}

// What a part is in a reaction step, for Show Reaction Interpretation: by its atoms (a structure) or its id (text).
export type Role = "reactant" | "product" | "above" | "below";
export function rolesOf(steps: RoleStep[]): { atoms: Map<number, Role>; captions: Map<number, Role> } {
  const atoms = new Map<number, Role>(), captions = new Map<number, Role>();
  const mark = (list: Part[], role: Role) => { for (const p of list) if (p.kind === "structure") for (const i of p.atoms) { if (!atoms.has(i)) atoms.set(i, role); } else if (!captions.has(p.id)) captions.set(p.id, role); };
  // A structure between two arrows is marked as the product it is first.
  steps.forEach((s, k) => { mark(s.reactants.filter(() => k === 0), "reactant"); mark(s.products, "product"); mark(s.above, "above"); mark(s.below, "below"); });
  return { atoms, captions };
}
