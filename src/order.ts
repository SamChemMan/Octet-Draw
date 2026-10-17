// Draw order (Object > Bring to Front and Send to Back), as ChemDraw's: any object can go over or under the rest.
// Octet draws in layers: fills, structures, arrows, outlines, text. A thing brought to the front gets an order above
// zero and is drawn over every layer; a thing sent to the back gets one below zero and is drawn under every layer.
// Things with an order are drawn lowest first. A structure's order is on each of its atoms.
import type { Mol } from "./render.ts";

type Thing = { kind: "structure"; atoms: number[] } | { kind: "caption" | "arrow" | "shape" | "cycle"; id: number };
// Each layer's place, for things that have no order yet: fills and shapes, cycles, structures, arrows, text.
const LAYER = { shape: 0, cycle: 1, structure: 2, arrow: 3, caption: 4 };

// Every order the drawing uses.
const ordersOf = (m: Mol) => [...m.atoms, ...(m.captions ?? []), ...(m.arrows ?? []), ...(m.shapes ?? []), ...(m.cycles ?? [])]
  .flatMap((x) => (x.order ? [x.order] : []));

// The selection to the front (or the back): structures (each a list of its atoms) and the picked captions, arrows,
// shapes and cycles. They keep their order among themselves. Returns the drawing as it was when nothing moves.
export function reorder(m: Mol, structures: number[][], picked: Set<number>, front: boolean): Mol {
  const things: Thing[] = [
    ...structures.filter((g) => g.length).map((atoms): Thing => ({ kind: "structure", atoms })),
    ...(["caption", "arrow", "shape", "cycle"] as const).flatMap((kind) => (m[`${kind}s`] ?? []).filter((x) => picked.has(x.id)).map((x): Thing => ({ kind, id: x.id }))),
  ];
  if (!things.length) return m;
  const list = (t: Thing) => (t.kind === "structure" ? [] : (m[`${t.kind}s`] ?? []) as { id: number; order?: number }[]);
  const orderOf = (t: Thing) => (t.kind === "structure" ? m.atoms[t.atoms[0]].order : list(t).find((x) => x.id === t.id)?.order) ?? 0;
  const indexOf = (t: Thing) => (t.kind === "structure" ? t.atoms[0] : list(t).findIndex((x) => x.id === t.id));
  // As they are drawn now: by order, then by layer, then by their place in their list.
  things.sort((a, b) => orderOf(a) - orderOf(b) || LAYER[a.kind] - LAYER[b.kind] || indexOf(a) - indexOf(b));
  const all = ordersOf(m), start = front ? Math.max(0, ...all) + 1 : Math.min(0, ...all) - things.length;
  const next = new Map<string, number>(things.map((t, k) => [t.kind === "structure" ? `a${t.atoms[0]}` : `${t.kind}${t.id}`, start + k]));
  const atomOrder = new Map<number, number>();
  for (const t of things) if (t.kind === "structure") for (const i of t.atoms) atomOrder.set(i, next.get(`a${t.atoms[0]}`)!);
  const set = <T extends { id: number; order?: number }>(kind: string, xs?: T[]) => xs?.map((x) => (next.has(`${kind}${x.id}`) ? { ...x, order: next.get(`${kind}${x.id}`) } : x));
  return {
    ...m,
    atoms: m.atoms.map((a, i) => (atomOrder.has(i) ? { ...a, order: atomOrder.get(i) } : a)),
    captions: set("caption", m.captions), arrows: set("arrow", m.arrows), shapes: set("shape", m.shapes), cycles: set("cycle", m.cycles),
  };
}
