// The Properties panel: ChemDraw's Analysis and Chemical Properties windows in one, for every structure in the
// selection (or the drawing; values for several structures are separated by semicolons, as ChemDraw does). A
// click on a value copies its row; the boxes choose the rows Add to drawing writes under each structure.
import { useLayoutEffect, useMemo, useState } from "react";
import { Check, X } from "@phosphor-icons/react";
import type { Structure } from "./chem";
import type { Graph } from "./naming";
import { elementalAnalysis, isotopePattern } from "./mass";
import { useMovable } from "./movable";
import { massText } from "./query";

// What Octet's own calculators (props.ts) give for a structure.
export type Calculated = {
  tpsa: number; henry?: number; pka: { atom: number; kind: string; pka: number; sd: number }[];
  joback?: { tb: number; tm: number; tc: number; pc: number; vc: number; hf: number; gf: number };
  logS?: number;
};
type Row = { key: string; name: string; value: (s: Structure, c?: Calculated) => string | undefined };

const SUB = "₀₁₂₃₄₅₆₇₈₉";
const sign = (x: number, places: number) => x.toFixed(places).replace("-", "−");
const celsius = (k?: number) => (k === undefined ? undefined : `${sign(k - 273.15, 1)} °C`);
const unit = (x: number | undefined, places: number, u: string) => (x === undefined || !Number.isFinite(x) ? undefined : `${sign(x, places)} ${u}`);

// The rows, in ChemDraw's two windows' order: analysis, then physical properties, then the medicinal chemist's.
export const PROPERTY_ROWS: Row[][] = [
  [
    { key: "formula", name: "Formula", value: (s) => s.formula },
    { key: "exact", name: "Exact mass", value: (s) => (Number.isFinite(s.exact) ? massText(s, "exact", 4) : undefined) },
    { key: "weight", name: "Molecular weight", value: (s) => massText(s, "weight", 2) },
    { key: "mz", name: "m/z", value: (s) => isotopePattern(s.formula)?.slice(0, 6).map((p) => `${p.mz.toFixed(2)} (${p.rel.toFixed(1)}%)`).join(", ") },
    { key: "analysis", name: "Elemental analysis", value: (s) => elementalAnalysis(s.composition) },
  ],
  [
    { key: "tb", name: "Boiling point", value: (_, c) => celsius(c?.joback?.tb) },
    { key: "tm", name: "Melting point", value: (_, c) => celsius(c?.joback?.tm) },
    { key: "tc", name: "Critical temperature", value: (_, c) => celsius(c?.joback?.tc) },
    { key: "pc", name: "Critical pressure", value: (_, c) => unit(c?.joback?.pc, 2, "bar") },
    { key: "vc", name: "Critical volume", value: (_, c) => unit(c?.joback?.vc, 1, "cm³/mol") },
    { key: "hf", name: "Heat of formation", value: (_, c) => unit(c?.joback?.hf, 2, "kJ/mol") },
    { key: "gf", name: "Gibbs energy", value: (_, c) => unit(c?.joback?.gf, 2, "kJ/mol") },
    { key: "henry", name: "Henry's law (log)", value: (_, c) => (c?.henry === undefined ? undefined : sign(c.henry, 2)) },
  ],
  [
    { key: "logp", name: "logP", value: (s) => (s.logP === undefined ? undefined : sign(s.logP, 2)) },
    { key: "mr", name: "Molar refractivity", value: (s) => unit(s.mr, 2, "cm³/mol") },
    { key: "tpsa", name: "tPSA", value: (_, c) => unit(c?.tpsa, 2, "Å²") },
    { key: "logs", name: "logS", value: (_, c) => (c?.logS === undefined ? undefined : sign(c.logS, 2)) },
    { key: "pka", name: "pKa", value: (_, c) => (c?.pka.length ? c.pka.map((p) => `${p.pka.toFixed(1)} (${p.kind})`).join(", ") : undefined) },
  ],
];

// Each row's values, one per structure, for the rows that have any.
export function propertyValues(structures: Structure[], calc?: (s: Structure, g: Graph) => Calculated | undefined) {
  const calculated = structures.map((s) => (s.graph && calc ? calc(s, s.graph) : undefined));
  return PROPERTY_ROWS.map((group) => group.map((row) => ({ ...row, values: structures.map((s, k) => row.value(s, calculated[k])) })).filter((r) => r.values.some((v) => v !== undefined)));
}
export type PropertyValues = ReturnType<typeof propertyValues>;

type Props = { values: PropertyValues; chosen: string[]; onChoose: (key: string) => void; onCopy: (text: string) => void; onAdd: () => void; onClose: () => void; stacked?: boolean };

export function Properties({ values, chosen, onChoose, onCopy, onAdd, onClose, stacked }: Props) {
  const show = (key: string, v: string) => (key === "formula" ? v.replace(/\d/g, (d) => SUB[Number(d)]) : v);
  const groups = useMemo(() => values.filter((g) => g.length), [values]);
  // It opens where the Spectrum opens, along the bottom (above the Spectrum when that is open too), and moves by its
  // header.
  const move = useMovable("properties");
  // Stacked: it sits on the Spectrum's top edge and shrinks to the room above it, so it never covers the Spectrum's
  // controls.
  const [below, setBelow] = useState(0);
  useLayoutEffect(() => {
    const el = stacked ? document.querySelector<HTMLElement>(".spectrum") : null;
    if (!el) return setBelow(0);
    const fit = () => setBelow(el.offsetHeight);
    fit();
    const watch = new ResizeObserver(fit);
    watch.observe(el);
    return () => watch.disconnect();
  }, [stacked]);
  return (
    <section className={stacked ? "properties stacked" : "properties"} aria-label="Properties" style={{ ...move.style, ...(stacked ? { "--below": `${below}px` } : {}) } as React.CSSProperties}>
      <header onPointerDown={move.onPointerDown}>
        <h2>Properties</h2>
        <button className="actions-close" onClick={onClose} aria-label="Close properties" title="Close properties"><X size={12} /></button>
      </header>
      <div className="prop-list">
        {groups.map((g, k) => (
          <div key={k} className="prop-group">
            {g.map((row) => {
              const text = row.values.map((v) => (v === undefined ? "–" : v)).join("; "), on = chosen.includes(row.key);
              return (
                <div key={row.key} className={`prop-row${text.length > 18 ? " long" : ""}`}>
                  <button className="prop-check" role="checkbox" aria-checked={on} aria-label={`Add ${row.name} to the drawing`} title="Add to drawing" onClick={() => onChoose(row.key)}>
                    {on && <Check size={12} />}
                  </button>
                  <span className="prop-name">{row.name}</span>
                  <button className={row.key === "formula" ? "prop-value formula" : "prop-value"} title="Copy" onClick={() => onCopy(`${row.name}: ${text}`)}>{show(row.key, text)}</button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <button className="prop-add" onClick={onAdd} disabled={!chosen.length}>Add to drawing</button>
    </section>
  );
}
