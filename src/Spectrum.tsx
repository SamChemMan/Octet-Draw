// The Spectrum panel: the predicted ¹H or ¹³C NMR spectrum of a structure, docked under the canvas (ChemDraw opens a
// new window; here the structure stays in view). Pointing at a peak lights its atoms on the canvas and pointing at an
// atom lights its peak. The wheel zooms the shift axis, a drag pans it and a double-click shows all of it. Expanded,
// the panel fills the canvas with the structure beside the spectrum (the canvas's own drawing, shown again).
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowsIn, ArrowsOut, ChartLine, CopySimple, ListBullets, Tag, X } from "@phosphor-icons/react";
import { acsText, detailsTable, multiplicity, quality, type Nucleus, type Prediction, type Signal } from "./nmr";
import { Select } from "./Select";
import { Segmented } from "./Fields";
import { listOpen, Pick } from "./Menu";
import { useMovable } from "./movable";
import { holdCursor } from "./cursor";
import { useLeaving } from "./motion";
import { HIGHLIGHTS } from "./docstyle";
import { fullRange, lines, lorentz as traceAt, solventPeaks, spread, ticks, SOLVENTS } from "./spectrumplot";

const FIELDS = [60, 80, 90, 200, 300, 400, 500, 600, 700, 800];
const HEIGHT = 184, TOP = 44, BASE = 26, PAD = 14; // px: the plot docked, room for labels above it and the axis below, and its ends

// Colours for peaks and the discs behind their atoms: the highlight colours.
export const PEAK_COLOURS = HIGHLIGHTS.map(([, hex]) => hex);

type Props = {
  prediction?: Prediction; nucleus: Nucleus; mhz: number; solvent: string; lit: Set<number>; solventPeaks: boolean;
  colours: (string | undefined)[]; // each signal's colour (its atoms' highlight)
  details: boolean; onDetails: (on: boolean) => void; // the table of how each shift was found
  onColour: (signal: number, colour?: string) => void; onColourAll: (on: boolean) => void;
  // Add to drawing: the spectrum as shown (its shift range), each shift beside its atom, or the key (coloured shifts),
  // as objects on the page that save, print and export with it.
  onAdd: (what: "spectrum" | "shifts" | "key", range: [number, number]) => void;
  inset?: [number, number, number, number]; // the structure's box on the canvas (px), shown beside the spectrum when expanded
  onNucleus: (n: Nucleus) => void; onMhz: (mhz: number) => void; onSolvent: (s: string) => void; onSolventPeaks: (on: boolean) => void;
  onPoint: (atoms?: number[]) => void; onCopy: (text: string) => void; onClose: () => void;
};

export function SpectrumPanel(p: Props) {
  const box = useRef<HTMLDivElement>(null), [width, setWidth] = useState(600), [expanded, setExpanded] = useState(false), [tall, setTall] = useState(HEIGHT);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => { setWidth(el.clientWidth); setTall(Math.max(HEIGHT, el.clientHeight)); };
    fit();
    const watch = new ResizeObserver(fit);
    watch.observe(el);
    return () => watch.disconnect();
  }, [expanded]);
  // Escape leaves full screen.
  useEffect(() => {
    if (!expanded) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape" && !listOpen()) { e.stopPropagation(); setExpanded(false); } };
    addEventListener("keydown", key, true);
    return () => removeEventListener("keydown", key, true);
  }, [expanded]);
  const HEIGHT_ = expanded ? tall : HEIGHT;
  const all = useMemo(() => fullRange(p.prediction, p.nucleus), [p.prediction, p.nucleus]);
  const [range, setRange] = useState<[number, number]>();
  const [lo, hi] = range ?? all;
  useLayoutEffect(() => setRange(undefined), [p.nucleus, p.prediction]);
  const x = (ppm: number) => PAD + ((hi - ppm) / (hi - lo)) * (width - 2 * PAD), ppmAt = (px: number) => hi - ((px - PAD) / (width - 2 * PAD)) * (hi - lo);
  const signals = useMemo(() => p.prediction?.signals ?? [], [p.prediction]);
  const shown = (s: Signal) => s.shift >= lo && s.shift <= hi;
  // Each signal's lines (¹³C: one), computed once.
  const split = useMemo(() => signals.map((s) => (p.nucleus === "1H" ? lines(s, p.mhz) : [{ ppm: s.shift, h: s.nuclei }])), [signals, p.nucleus, p.mhz]);
  const [pointed, setPointed] = useState<number>();
  const [chosen, setChosen] = useState<number>(); // the peak clicked, to colour
  useLayoutEffect(() => setChosen(undefined), [p.nucleus, p.prediction]);
  const drag = useRef<{ from: number; range: [number, number]; moved: boolean }>(undefined);
  const move = useMovable("spectrum", expanded), leaving = useLeaving(); // full screen stays put
  const anyColour = p.colours.some(Boolean);

  // The trace: ¹H as Lorentzian lines summed at each pixel (at least a pixel and a half wide, so narrow lines show
  // at any zoom); ¹³C as sticks, as tall as the carbons they count.
  const lorentz = (ls: { ppm: number; h: number; w: number }[]) => traceAt(Array.from({ length: width + 1 }, (_, px) => ppmAt(px)), ls);
  const least = (0.75 * (hi - lo)) / width;
  const trace = useMemo(() => {
    if (p.nucleus !== "1H" || !signals.length) return undefined;
    return lorentz(signals.flatMap((s, k) => split[k].map((l) => ({ ...l, w: Math.max((s.broad ? 12 : 0.6) / p.mhz, least) }))));
  }, [split, signals, p.nucleus, p.mhz, lo, hi, width]); // eslint-disable-line react-hooks/exhaustive-deps
  // The solvent's own peaks, in grey: the residual peak (and water) in ¹H, the deuterated carbons in ¹³C.
  const solvent = useMemo(() => (p.solventPeaks ? solventPeaks(p.solvent, p.nucleus, p.mhz) : []), [p.solvent, p.solventPeaks, p.nucleus, p.mhz]);
  const solventTrace = useMemo(() => (p.nucleus === "1H" && solvent.length ? lorentz(solvent.flatMap((s) => s.lines.map((l) => ({ ...l, w: Math.max((s.broad ? 6 : 0.6) / p.mhz, least) })))) : undefined),
    [solvent, p.nucleus, p.mhz, lo, hi, width]); // eslint-disable-line react-hooks/exhaustive-deps
  const top = p.nucleus === "1H" ? Math.max(1e-9, ...(trace ?? [0]), ...(solventTrace ?? [0])) : Math.max(1, ...signals.map((s) => s.nuclei), ...solvent.flatMap((s) => s.lines.map((l) => l.h)));
  const y = (v: number) => HEIGHT_ - BASE - (v / top) * (HEIGHT_ - BASE - TOP);
  const pathOf = (ys?: number[]) => (ys ? ys.map((v, px) => `${px ? "L" : "M"}${px} ${y(v).toFixed(1)}`).join("") : "");
  const path = pathOf(trace);
  const inRange = signals.map((s, k) => (shown(s) ? k : -1)).filter((k) => k >= 0), placed = spread(inRange.map((k) => x(signals[k].shift)), p.nucleus === "1H" ? 44 : 38, width);
  const labels: number[] = [];
  inRange.forEach((k, i) => { labels[k] = placed[i]; });
  const on = (s: Signal, k: number) => pointed === k || s.atoms.some((a) => p.lit.has(a));
  const { out: tickAt, places } = ticks(lo, hi, width);
  const text = p.prediction ? acsText(p.prediction, p.mhz, p.solvent) : "";

  // The signal under the pointer: the nearest whose lines span the pointer, within 8 px.
  const signalAt = (px: number) => {
    let best: number | undefined, d = 8;
    split.forEach((ls, k) => {
      const a = Math.min(...ls.map((l) => x(l.ppm))), b = Math.max(...ls.map((l) => x(l.ppm))), gap = px < a ? a - px : px > b ? px - b : 0;
      if (gap < d) { d = gap; best = k; }
    });
    return best;
  };

  return (
    <section className={["spectrum", expanded && "expanded", leaving && "leaving"].filter(Boolean).join(" ")} aria-label="Spectrum" style={move.style} inert={leaving}>
      {/* The shared panel header (as Actions and Properties): the title at the left, the close button at the top right.
          The controls sit in a row of their own under it. */}
      <header onPointerDown={move.onPointerDown}>
        <h2>{p.nucleus === "1H" ? "¹H NMR" : "¹³C NMR"}</h2>
        <span className="spectrum-head-buttons">
          <button className="actions-close" onClick={() => setExpanded(!expanded)} aria-label={expanded ? "Leave full screen" : "Full screen"} data-tip={expanded ? "Leave full screen" : "Full screen"}>{expanded ? <ArrowsIn size={12} /> : <ArrowsOut size={12} />}</button>
          <button className="actions-close" onClick={p.onClose} aria-label="Close spectrum" data-tip="Close spectrum"><X size={12} /></button>
        </span>
      </header>
      <div className="spectrum-controls">
        <Segmented label="Nucleus" value={p.nucleus} options={[["1H", "¹H"], ["13C", "¹³C"]]} onChange={p.onNucleus} />
        <Select label="Frequency" value={String(p.mhz)} options={FIELDS.map((f) => [String(f), `${f} MHz`])} onChange={(v) => p.onMhz(Number(v))} />
        <Select label="Solvent" value={p.solvent} options={SOLVENTS.map((s) => [s, s])} onChange={p.onSolvent} />
        <button className="spectrum-button" aria-pressed={p.solventPeaks} onClick={() => p.onSolventPeaks(!p.solventPeaks)} data-tip={p.solventPeaks ? "Hide the solvent's peaks" : "Show the solvent's peaks"}>Solvent peaks</button>
        <button className="spectrum-button" aria-pressed={p.details} onClick={() => p.onDetails(!p.details)} data-tip={p.details ? "Hide the details" : "How each shift was predicted, and how far to trust it"}>Details</button>
        <span className="spectrum-gap" />
        {chosen !== undefined && (
          // The clicked peak's colour, which its atoms take as a highlight too.
          <span className="spectrum-swatches" role="radiogroup" aria-label="Peak colour">
            {HIGHLIGHTS.map(([name, c]) => <button key={c} role="radio" aria-checked={p.colours[chosen] === c} aria-label={name} data-tip={name} className="swatch" style={{ background: c }} onClick={() => p.onColour(chosen, c)} />)}
            <button role="radio" aria-checked={!p.colours[chosen]} aria-label="No colour" data-tip="No colour" className="swatch none" onClick={() => p.onColour(chosen, undefined)} />
          </span>
        )}
        <button className="spectrum-button" onClick={() => p.onColourAll(!anyColour)} disabled={!signals.length}>{anyColour ? "Clear colours" : "Colour peaks"}</button>
        {signals.length > 0 && (
          <Pick label="Add to drawing" value="" className="spectrum-button" title="Put the spectrum, the shifts or the key on the page"
            groups={[[{ key: "spectrum", name: "Spectrum", icon: <ChartLine size={18} /> }, { key: "shifts", name: "Shifts beside atoms", icon: <Tag size={18} /> }, { key: "key", name: "Key", icon: <ListBullets size={18} /> }]]}
            onPick={(what) => p.onAdd(what as "spectrum" | "shifts" | "key", [lo, hi])}>
            Add to drawing
          </Pick>
        )}
        <button className="spectrum-button" onClick={() => p.onCopy(text)} disabled={!text} data-tip="Copy the characterisation line"><CopySimple size={16} /> Copy</button>
      </div>
      <div className="spectrum-body">
      <div ref={box} className="spectrum-plot">
        <svg
          width={width} height={HEIGHT_} role="img" aria-label={text || "No spectrum"}
          onWheel={(e) => {
            const at = ppmAt(e.nativeEvent.offsetX), k = Math.exp(e.deltaY * 0.002), least = p.nucleus === "1H" ? 0.05 : 1;
            const span = Math.min(all[1] - all[0], Math.max(least, (hi - lo) * k)), f = (hi - at) / (hi - lo);
            const h = Math.min(all[1], Math.max(all[0] + span, at + f * span));
            setRange([h - span, h]);
          }}
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); holdCursor(e.currentTarget); drag.current = { from: e.clientX, range: [lo, hi], moved: false }; }}
          onPointerMove={(e) => {
            if (drag.current && e.buttons && Math.abs(e.clientX - drag.current.from) > 3) {
              drag.current.moved = true;
              const [a, b] = drag.current.range, d = ((e.clientX - drag.current.from) / width) * (b - a), shift = Math.min(all[1] - b, Math.max(all[0] - a, d));
              return setRange([a + shift, b + shift]);
            }
            const k = signalAt(e.nativeEvent.offsetX);
            if (k !== pointed) { setPointed(k); p.onPoint(k === undefined ? undefined : signals[k].atoms); }
          }}
          // A click (no drag) picks the peak under the pointer to colour, or lets go of it.
          onPointerUp={() => { if (drag.current && !drag.current.moved) setChosen(pointed); drag.current = undefined; }}
          onPointerLeave={() => { if (pointed !== undefined) { setPointed(undefined); p.onPoint(undefined); } }}
          onDoubleClick={() => setRange(undefined)}
        >
          <line className="spectrum-axis" x1={PAD} x2={width - PAD} y1={HEIGHT_ - BASE} y2={HEIGHT_ - BASE} />
          {tickAt.map((v) => (
            <g key={v} className="spectrum-tick">
              <line x1={x(v)} x2={x(v)} y1={HEIGHT_ - BASE} y2={HEIGHT_ - BASE + 4} />
              <text x={x(v)} y={HEIGHT_ - BASE + 16} textAnchor="middle">{v.toFixed(places)}</text>
            </g>
          ))}
          <text className="spectrum-unit" x={width - 2} y={HEIGHT_ - 2} textAnchor="end">ppm</text>
          {solventTrace && <path className="spectrum-solvent" d={pathOf(solventTrace)} />}
          {p.nucleus === "13C" && solvent.flatMap((s, k) => s.lines.map((l, i) => l.ppm >= lo && l.ppm <= hi && <line key={`sv${k}-${i}`} className="spectrum-solvent" x1={x(l.ppm)} x2={x(l.ppm)} y1={HEIGHT_ - BASE} y2={y(l.h)} />))}
          {solvent.map((s, k) => {
            if (s.ppm < lo || s.ppm > hi) return null;
            // Above whatever is tallest there, the compound's peaks included.
            const at = (ppm: number) => Math.round(x(ppm)), around = s.lines.flatMap((l) => [at(l.ppm) - 4, at(l.ppm), at(l.ppm) + 4]);
            const tip = p.nucleus === "1H" ? y(Math.max(...around.map((px) => Math.max(solventTrace?.[px] ?? 0, trace?.[px] ?? 0))))
              : y(Math.max(...s.lines.map((l) => l.h), ...signals.filter((q) => Math.abs(x(q.shift) - x(s.ppm)) < 6).map((q) => q.nuclei)));
            return <text key={`sl${k}`} className="spectrum-solvent-label" x={x(s.ppm)} y={tip - 5} textAnchor="middle">{s.name}</text>;
          })}
          {signals.map((s, k) => {
            if (!on(s, k)) return null;
            const xs = split[k].map((l) => x(l.ppm)), a = Math.min(...xs), b = Math.max(...xs);
            return <rect key={k} className="spectrum-lit" x={a - 4} y={TOP - 2} width={b - a + 8} height={HEIGHT_ - BASE - TOP + 2} rx={3} />;
          })}
          {p.nucleus === "1H" && signals.map((s, k) => {
            // A coloured peak: its own lines, filled in its colour under the whole trace.
            const c = p.colours[k];
            if (!c || !shown(s)) return null;
            const own = lorentz(split[k].map((l) => ({ ...l, w: Math.max((s.broad ? 12 : 0.6) / p.mhz, least) })));
            const xs = split[k].map((l) => x(l.ppm)), a = Math.max(0, Math.floor(Math.min(...xs) - 40)), b = Math.min(width, Math.ceil(Math.max(...xs) + 40));
            const d = `M${a} ${y(0)}` + own.slice(a, b + 1).map((v, i) => `L${a + i} ${y(v).toFixed(1)}`).join("") + `L${b} ${y(0)}Z`;
            return <path key={`c${k}`} d={d} fill={c} fillOpacity={0.35} stroke={c} strokeWidth={1} />;
          })}
          {trace && <path className="spectrum-trace" d={path} />}
          {p.nucleus === "13C" && signals.map((s, k) => shown(s) && <line key={k} className={`spectrum-stick${on(s, k) ? " lit" : ""}`} x1={x(s.shift)} x2={x(s.shift)} y1={HEIGHT_ - BASE} y2={y(s.nuclei)} style={p.colours[k] ? { stroke: p.colours[k] } : undefined} />)}
          {signals.map((s, k) => {
            if (!shown(s)) return null;
            const xs = split[k].map((l) => x(l.ppm)), ly = TOP - 22;
            const tip = p.nucleus === "1H" ? y(Math.max(...xs.map((px) => trace?.[Math.round(px)] ?? 0))) : y(s.nuclei);
            return (
              <g key={k} className={`spectrum-signal${on(s, k) ? " lit" : ""}${chosen === k ? " chosen" : ""}`} style={p.colours[k] ? { fill: p.colours[k] } : undefined}
                data-tip={p.nucleus === "1H" ? `${s.shift.toFixed(2)} ppm, ${multiplicity(s)}${s.couplings.length ? `, J = ${s.couplings.map((c) => c.j.toFixed(1)).join(", ")} Hz` : ""}, ${s.nuclei}H` : `${s.shift.toFixed(1)} ppm, ${s.nuclei} C`}>
                <path className="spectrum-leader" d={`M${labels[k]} ${ly + 17}L${labels[k]} ${ly + 21}L${x(s.shift)} ${Math.min(tip - 3, ly + 28)}`} />
                <text x={labels[k]} y={ly} textAnchor="middle">{s.shift.toFixed(p.nucleus === "1H" ? 2 : 1)}</text>
                <text className="spectrum-integral" x={labels[k]} y={ly + 12} textAnchor="middle">{p.nucleus === "1H" ? `${multiplicity(s)}, ${s.nuclei}H` : s.nuclei > 1 ? `${s.nuclei}C` : ""}</text>
              </g>
            );
          })}
        </svg>
      </div>
      {expanded && p.inset && (
        <svg className="spectrum-inset" viewBox={`${p.inset[0]} ${p.inset[1]} ${p.inset[2] - p.inset[0]} ${p.inset[3] - p.inset[1]}`} role="img" aria-label="The structure">
          <use href="#world" />
        </svg>
      )}
      </div>
      {p.details && p.prediction && (() => {
        // How each shift was found: the group, its shift and couplings (with the groups they couple to), how many
        // spheres of its surroundings matched measured shifts, how many there were and how far they spread, and so how
        // far to trust it. Pointing at a row lights its atoms and peak, as pointing at the peak does.
        const groupOf = (atom: number) => signals.find((s) => s.atoms.includes(atom))?.group ?? "";
        const order = signals.map((_, k) => k).sort((a, b) => signals[b].shift - signals[a].shift);
        return (
          <div className="spectrum-details">
            <table>
              <thead>
                <tr><th>Group</th><th>δ (ppm)</th>{p.nucleus === "1H" ? <><th>Multiplicity</th><th>J (Hz)</th><th>Integral</th></> : <th>Carbons</th>}<th>Based on</th><th>Quality</th></tr>
              </thead>
              <tbody>
                {order.map((k) => {
                  const s = signals[k], q = quality(s, p.nucleus);
                  return (
                    <tr key={k} className={pointed === k ? "lit" : undefined} onPointerEnter={() => { setPointed(k); p.onPoint(s.atoms); }} onPointerLeave={() => { setPointed(undefined); p.onPoint(undefined); }}>
                      <td>{p.colours[k] && <span className="dot" style={{ background: p.colours[k] }} />}{s.group}</td>
                      <td className="num">{s.shift.toFixed(p.nucleus === "1H" ? 2 : 1)}</td>
                      {p.nucleus === "1H" ? (
                        <>
                          <td>{multiplicity(s)}</td>
                          <td>{s.couplings.length ? s.couplings.map((c) => `${c.j.toFixed(1)} to ${[...new Set((c.with ?? []).map(groupOf))].join(", ")}`).join("; ") : "–"}</td>
                          <td className="num">{s.nuclei}H</td>
                        </>
                      ) : <td className="num">{s.nuclei}</td>}
                      <td>{s.level} {s.level === 1 ? "sphere" : "spheres"} matched, {s.based} measured in {s.solvent ?? "any solvent"}, ±{s.sd.toFixed(p.nucleus === "1H" ? 2 : 1)}</td>
                      <td><span className={`quality ${q}`}>{q[0].toUpperCase() + q.slice(1)}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <button className="spectrum-button" onClick={() => p.onCopy(detailsTable(p.prediction!))}><CopySimple size={16} /> Copy table</button>
          </div>
        );
      })()}
      <footer className="spectrum-foot">
        <p className="spectrum-text">{text}</p>
        <span className="spectrum-credit" data-tip="Contains information from nmrshiftdb2 (www.nmrshiftdb.org), made available under the nmrshiftdb2 Database License">nmrshiftdb2</span>
      </footer>
    </section>
  );
}
