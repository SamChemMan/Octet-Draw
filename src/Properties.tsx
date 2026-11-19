// The Properties panel: ChemDraw's Analysis and Chemical Properties windows in one, for every structure in the
// selection (or the drawing; values for several structures are separated by semicolons, as ChemDraw does), and the
// structures' GHS hazards from PubChem (ChemDraw's PubChem GHS LCSS add-in), in two tabs: Properties and Hazards.
// Properties holds three groups in one reading order: Composition, Structure and Predicted (Octet's models; every copy
// of their values says (predicted)). A click on a value copies its row; the boxes choose the rows Add to drawing
// writes under each structure. Decimals sets the places of every calculated number (ChemDraw's Analysis window: 0 to
// 8; the elemental analysis keeps 2); Copy report copies every value with the method and source it comes from
// (ChemDraw's Report…). Names off: Add to drawing writes the values without their names (issue 77; ChemDraw's
// empty Property Labels word does the same). Hazards opens with Find hazards (with Online search on); while it runs it
// is Stop. Then the pictograms are drawn with the signal word, each statement is on its own line, a PubChem CID opens
// the compound's Safety and Hazards page in the browser, and the source closes the tab. Suppliers have their own
// window (SupplierWindow.tsx).
import { useLayoutEffect, useMemo, useState } from "react";
import { ArrowSquareOut, Check, CopySimple, FirstAidKit, Stop } from "@phosphor-icons/react";
import { PanelControls } from "./PanelControls";
import { useMovable } from "./movable";
import { Select } from "./Select";
import { Segmented } from "./Fields";
import { propertyReport, rowLabel, type PropertyValues } from "./proprows";
import { useLeaving } from "./motion";
import { PICTOGRAMS } from "./ghs";

const SUB = "₀₁₂₃₄₅₆₇₈₉";
// Decimals: ChemDraw's 0 to 8, and Standard: each row's own places (4 for the exact mass, 1 for the temperatures,
// critical volume and pKa, 2 for the rest).
const DECIMALS: [string, string][] = [["", "Standard"], ...Array.from({ length: 9 }, (_, n): [string, string] => [String(n), String(n)])];
// The Properties tab's groups: the rows of PROPERTY_ROWS's first group up to tPSA, the rest of it, then every predicted
// row under one heading.
const STRUCTURE_FROM = "tpsa";
export type PropertiesTab = "properties" | "hazards";
type Row = PropertyValues[number][number];

type Props = {
  values: PropertyValues; chosen: string[]; onChoose: (key: string) => void; onCopy: (text: string) => void; onAdd: () => void; onClose: () => void; stacked?: string; // the panel it sits on, when one is open
  decimals?: number; onDecimals: (places?: number) => void; names: boolean; onNames: (on: boolean) => void;
  tab: PropertiesTab; onTab: (tab: PropertiesTab) => void;
  // Find hazards: Online search on, whether it runs now, whether every structure has been looked up, and Settings.
  online: boolean; finding: boolean; looked: boolean; onHazards: () => void; onOpen: (cid: string) => void; onSettings: () => void;
};

// A GHS pictogram: the diamond in the error colour (GHS draws it red) and the symbol in ink.
const Pictogram = ({ code }: { code: string }) => (
  <svg className="ghs" viewBox="-50 -50 100 100" role="img" aria-label={`${PICTOGRAMS[code].name} (${code})`}>
    <path className="ghs-diamond" d="M0 -46L46 0L0 46L-46 0Z" />
    {PICTOGRAMS[code].parts.map(([kind, d], i) => <path key={i} className={`ghs-${kind}`} d={d} />)}
  </svg>
);

export function Properties({ values, chosen, onChoose, onCopy, onAdd, onClose, stacked, decimals, onDecimals, names, onNames, tab, onTab, online, finding, looked, onHazards, onOpen, onSettings }: Props) {
  const [calculated, hazards] = useMemo(() => {
    const [first = [], ...rest] = values, at = first.findIndex((r) => r.key === STRUCTURE_FROM);
    // Every predicted row under the one Predicted heading, so a predicted value is never shown as a plain one.
    const predicted = values.flat().filter((r) => r.predicted);
    const groups: [string, Row[]][] = [["Composition", at < 0 ? first : first.slice(0, at)], ["Structure", at < 0 ? [] : first.slice(at)], ["Predicted", predicted]];
    return [groups.filter(([, rows]) => rows.length), rest[rest.length - 1] ?? []];
  }, [values]);
  // It opens where the Spectrum opens, along the bottom (above the Spectrum when that is open too), and moves by its
  // header.
  const move = useMovable("properties"), leaving = useLeaving();
  // Stacked: it sits on the Spectrum's top edge and shrinks to the room above it, so it never covers the Spectrum's
  // controls.
  const [below, setBelow] = useState(0);
  useLayoutEffect(() => {
    const el = stacked ? document.querySelector<HTMLElement>(".spectrum:not(.minimised)") : null;
    if (!el) return setBelow(0);
    const fit = () => setBelow(el.offsetHeight);
    fit();
    const watch = new ResizeObserver(fit);
    watch.observe(el);
    return () => watch.disconnect();
  }, [stacked]);
  const box = (row: Row) => {
    const on = chosen.includes(row.key);
    return (
      <button className="prop-check" role="checkbox" aria-checked={on} aria-label={`Add ${rowLabel(row)} to the drawing`} data-tip="Add to drawing" onClick={() => onChoose(row.key)}>
        {on && <Check size={12} />}
      </button>
    );
  };
  const joined = (row: Row) => row.values.map((v) => (v === undefined ? "–" : v)).join("; ");
  // An m/z peak or an element's percentage never breaks inside itself: the line breaks only between them.
  const pieces = (t: string) => t.split(/(?<=[,;]) /).map((p, i) => <span key={i} className="prop-piece">{i > 0 && " "}{p}</span>);
  // A row on the Properties tab: its box, its name and its value, which copies the row. The formula's counts are drawn
  // as subscripts.
  const valueRow = (row: Row) => {
    const text = joined(row);
    return (
      <div key={row.key} className="prop-row">
        {box(row)}
        <span className="prop-name">{row.name}</span>
        <button className={row.key === "formula" ? "prop-value formula" : "prop-value"} data-tip="Copy" onClick={() => onCopy(`${rowLabel(row)}: ${text}`)}>
          {row.key === "formula" ? text.replace(/\d/g, (d) => SUB[Number(d)]) : row.key === "mz" || row.key === "analysis" ? pieces(text) : text}
        </button>
      </div>
    );
  };
  // The Hazards tab's rows, each with its name over its value. The pictograms are drawn; each structure's statements
  // go one to a line (from its own value, as a statement can hold a semicolon: H360FD); a CID opens PubChem.
  const hazardValue = (row: Row) => {
    if (row.key === "ghs") return row.values.map((one = "–", k) => <span key={k} className="ghs-set">{one.match(/GHS0[1-9]/g)?.map((c) => <Pictogram key={c} code={c} />) ?? one}</span>);
    if (row.key === "hazards") return row.values.map((one = "–", k) => <span key={k} className="prop-lines">{one.split(/, (?=(?:EUH|H)\d{3})/).map((line, i) => <span key={i}>{line}</span>)}</span>);
    if (row.key === "precautions") return row.values.map((one = "–", k) => <span key={k} className="prop-codes">{one.split(", ").map((c, i) => <span key={i}>{c}</span>)}</span>);
    if (row.key === "signal") return row.values.map((one = "–", k) => <span key={k} className="prop-signal">{one}</span>);
    return joined(row);
  };
  const source = hazards.find((r) => r.key === "ghs-source"), shown = hazards.filter((r) => r.key !== "ghs-source");
  return (
    <section className={["properties", stacked && "stacked", leaving && "leaving"].filter(Boolean).join(" ")} aria-label="Properties" inert={leaving} style={{ ...move.style, ...(stacked ? { "--below": `${below}px` } : {}) } as React.CSSProperties}>
      <header onPointerDown={move.onPointerDown}>
        <Segmented label="Show" className="prop-tabs" value={tab} onChange={onTab} options={[["properties", "Properties"], ["hazards", "Hazards"]]} />
        <PanelControls close={onClose} />
      </header>
      {tab === "properties" ? (
        <div className="prop-list">
          {calculated.map(([heading, rows]) => (
            <div key={heading} className={`prop-group ${heading.toLowerCase()}`}>
              <h3 className="prop-heading">{heading}</h3>
              <div className="prop-rows">{rows.map(valueRow)}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="prop-hazards">
          {shown.length > 0 && (
            <div className="prop-hazard-rows">
              {shown.map((row) => (
                <div key={row.key} className={`prop-row stack hazard-${row.key}`}>
                  {box(row)}
                  <span className="prop-name">{row.name}</span>
                  {row.key === "cid" ? (
                    <span className="prop-links">{row.values.map((v, k) => (v ? <button key={k} className="prop-link" aria-label={`Open CID ${v} in PubChem`} data-tip="Open in PubChem" onClick={() => onOpen(v)}>{v}<ArrowSquareOut size={12} aria-hidden /></button> : <span key={k}>–</span>))}</span>
                  ) : (
                    <button className="prop-value" data-tip="Copy" onClick={() => onCopy(`${rowLabel(row)}: ${joined(row)}`)}>{hazardValue(row)}</button>
                  )}
                </div>
              ))}
            </div>
          )}
          {!online ? (
            <div className="prop-empty">
              <span>Online search is off.</span>
              <button className="prop-add" onClick={onSettings}>Open Settings</button>
            </div>
          ) : (finding || !looked) && (
            <div className="prop-empty">
              {!shown.length && <span>{finding ? "Searching PubChem" : "GHS hazards from PubChem"}</span>}
              <button className="prop-add" onClick={onHazards} aria-label={finding ? "Stop finding hazards" : undefined}>
                {finding ? <><Stop size={16} aria-hidden /> Stop</> : <><FirstAidKit size={16} aria-hidden /> Find hazards</>}
              </button>
            </div>
          )}
          {source && <p className="prop-source">Source: {source.values.filter(Boolean).join("; ")}</p>}
        </div>
      )}
      <div className="prop-foot">
        <button className="prop-add primary" onClick={onAdd} disabled={!chosen.length}>Add to drawing</button>
        <button className="prop-add" onClick={() => onCopy(propertyReport(values))} disabled={!values.some((g) => g.length)} data-tip="Copy every value with its method and source"><CopySimple size={16} aria-hidden /> Copy report</button>
        <span className="prop-decimals">
          <button className="spectrum-button" aria-pressed={names} aria-label="Property names" data-tip={names ? "Add the values without their names" : "Add the values with their names"} onClick={() => onNames(!names)}>Names</button>
          {tab === "properties" && <>
            <span className="prop-name">Decimals</span>
            <Select label="Decimals" value={decimals === undefined ? "" : String(decimals)} options={DECIMALS} onChange={(v) => onDecimals(v === "" ? undefined : Number(v))} />
          </>}
        </span>
      </div>
    </section>
  );
}
