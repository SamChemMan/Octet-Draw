// The Spectrum panel: the predicted ¹H or ¹³C NMR spectrum of a structure, docked under the canvas (ChemDraw opens a
// new window; here the structure stays in view). Pointing at a peak lights its atoms on the canvas and pointing at an
// atom lights its peak. The wheel zooms the shift axis, a drag pans it and a double-click shows all of it. Expanded,
// the panel fills the canvas with the structure beside the spectrum (the canvas's own drawing, shown again).
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowsIn, ArrowsOut, CopySimple, X } from "@phosphor-icons/react";
import { acsText, detailsTable, multiplicity, quality, type Nucleus, type Prediction, type Signal } from "./nmr";
import { Select } from "./Select";
import { useMovable } from "./movable";
import { useLeaving } from "./motion";

export const SOLVENTS = ["CDCl₃", "DMSO-d₆", "CD₃OD", "D₂O", "C₆D₆", "Acetone-d₆", "CD₃CN"];
const FIELDS = [60, 80, 90, 200, 300, 400, 500, 600, 700, 800];
const HEIGHT = 184, TOP = 44, BASE = 26, PAD = 14; // px: the plot docked, room for labels above it and the axis below, and its ends

// Residual solvent and water peaks (Fulmer et al., Organometallics 2010, 29, 2176): each peak's shift with the number
// of deuteriums the nucleus couples to and J to deuterium (Hz). CHD₂ residual protons are quintets; CDCl₃ is a 1:1:1
// triplet in ¹³C and CD₃ a septet.
const SOLVENT_PEAKS: Record<string, { h: [number, number, number][]; water?: number; c: [number, number, number][] }> = {
  "CDCl₃": { h: [[7.26, 0, 0]], water: 1.56, c: [[77.16, 1, 32]] },
  "DMSO-d₆": { h: [[2.5, 2, 1.9]], water: 3.33, c: [[39.52, 3, 21]] },
  "CD₃OD": { h: [[3.31, 2, 1.7]], water: 4.87, c: [[49.0, 3, 21.4]] },
  "D₂O": { h: [[4.79, 0, 0]], c: [] },
  "C₆D₆": { h: [[7.16, 0, 0]], water: 0.4, c: [[128.06, 1, 24]] },
  "Acetone-d₆": { h: [[2.05, 2, 2.2]], water: 2.84, c: [[29.84, 3, 19.4], [206.26, 0, 0]] },
  "CD₃CN": { h: [[1.94, 2, 2.5]], water: 2.13, c: [[1.32, 3, 21], [118.26, 0, 0]] },
};
// A peak split by n deuteriums (spin 1): 2n + 1 lines, heights from repeated 1:1:1, adding up to `total`.
function deuterated(ppm: number, n: number, j: number, mhz: number, total: number) {
  let row = [1];
  for (let k = 0; k < n; k++) row = Array.from({ length: row.length + 2 }, (_, i) => (row[i - 2] ?? 0) + (row[i - 1] ?? 0) + (row[i] ?? 0));
  const sum = row.reduce((a, b) => a + b, 0);
  return row.map((h, i) => ({ ppm: ppm + ((i - n) * j) / mhz, h: (h / sum) * total }));
}

// Colours for peaks and the discs behind their atoms: distinct, and clear on white at 40% behind a structure.
export const PEAK_COLOURS = ["#2F6FED", "#F28C28", "#2BA84A", "#E5484D", "#8E4EC6", "#12A594", "#D6409F", "#C9A000", "#A0522D", "#5B6B8C"];

type Props = {
  prediction?: Prediction; nucleus: Nucleus; mhz: number; solvent: string; lit: Set<number>; solventPeaks: boolean;
  colours: (string | undefined)[]; // each signal's colour (its atoms' highlight)
  details: boolean; onDetails: (on: boolean) => void; // the table of how each shift was found
  onColour: (signal: number, colour?: string) => void; onColourAll: (on: boolean) => void; onKey: () => void;
  inset?: [number, number, number, number]; // the structure's box on the canvas (px), shown beside the spectrum when expanded
  onNucleus: (n: Nucleus) => void; onMhz: (mhz: number) => void; onSolvent: (s: string) => void; onSolventPeaks: (on: boolean) => void;
  onPoint: (atoms?: number[]) => void; onCopy: (text: string) => void; onClose: () => void;
};

const binomial = (n: number) => { const row = [1]; for (let k = 1; k <= n; k++) row.push((row[k - 1] * (n - k + 1)) / k); return row; };
// A ¹H signal's lines: first-order splitting by each coupling (n + 1 lines with binomial heights, J apart), the
// heights adding up to the signal's number of hydrogens.
function lines(s: Signal, mhz: number): { ppm: number; h: number }[] {
  let out = [{ ppm: s.shift, h: s.nuclei }];
  for (const c of s.couplings) {
    const w = binomial(c.n), step = c.j / mhz, total = 2 ** c.n;
    out = out.flatMap((l) => w.map((k, i) => ({ ppm: l.ppm + (i - c.n / 2) * step, h: (l.h * k) / total })));
  }
  return out;
}
// The shift range to show all of a spectrum: 0 to 10 ppm for ¹H and 0 to 200 for ¹³C, wider if a shift is outside.
function fullRange(p: Prediction | undefined, nucleus: Nucleus): [number, number] {
  const shifts = p?.signals.map((s) => s.shift) ?? [], [lo, hi] = nucleus === "1H" ? [0, 10] : [0, 200], pad = nucleus === "1H" ? 0.5 : 10;
  return [Math.min(lo, ...shifts.map((x) => x - pad)), Math.max(hi, ...shifts.map((x) => x + pad))];
}
// Axis ticks: the first step that gives at most one label per 64 px.
function ticks(lo: number, hi: number, width: number) {
  const step = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50].find((s) => (hi - lo) / s <= width / 64) ?? 100;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Math.round(v / step) * step);
  return { out, places: step < 0.1 ? 2 : step < 1 ? 1 : 0 };
}
// Labels at least `gap` px apart and inside the plot, each as near its peak as it can be: pushed right past the one
// before, pulled back left from the right end, then each group of crowded labels centred on its peaks.
function spread(xs: number[], gap: number, width: number): number[] {
  const order = xs.map((x, i) => ({ x, i })).sort((a, b) => a.x - b.x), at = order.map((o) => o.x), n = at.length;
  for (let k = 0; k < n; k++) at[k] = Math.max(at[k], k ? at[k - 1] + gap : gap / 2);
  for (let k = n - 1; k >= 0; k--) at[k] = Math.min(at[k], k < n - 1 ? at[k + 1] - gap : width - gap / 2);
  for (let k = 0; k < n; k++) at[k] = Math.max(at[k], k ? at[k - 1] + gap : gap / 2);
  const out = xs.slice();
  order.forEach((o, k) => { out[o.i] = at[k]; });
  return out;
}

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
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setExpanded(false); } };
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
  const lorentz = (ls: { ppm: number; h: number; w: number }[]) => {
    const ys: number[] = [];
    for (let px = 0; px <= width; px++) { const v = ppmAt(px); ys.push(ls.reduce((sum, l) => sum + (l.h * l.w * l.w) / ((v - l.ppm) ** 2 + l.w * l.w), 0)); }
    return ys;
  };
  const least = (0.75 * (hi - lo)) / width;
  const trace = useMemo(() => {
    if (p.nucleus !== "1H" || !signals.length) return undefined;
    return lorentz(signals.flatMap((s, k) => split[k].map((l) => ({ ...l, w: Math.max((s.broad ? 12 : 0.6) / p.mhz, least) }))));
  }, [split, signals, p.nucleus, p.mhz, lo, hi, width]); // eslint-disable-line react-hooks/exhaustive-deps
  // The solvent's own peaks, in grey: the residual peak (and water) in ¹H, the deuterated carbons in ¹³C.
  const solvent = useMemo(() => {
    const s = SOLVENT_PEAKS[p.solvent];
    if (!p.solventPeaks || !s) return [];
    const mhz = p.nucleus === "1H" ? p.mhz : p.mhz * 0.25145;
    const peaks = p.nucleus === "1H" ? [...s.h.map(([ppm, n, j]) => ({ name: p.solvent, ppm, lines: deuterated(ppm, n, j, mhz, 1), broad: false })), ...(s.water !== undefined ? [{ name: "H₂O", ppm: s.water, lines: deuterated(s.water, 0, 0, mhz, 0.8), broad: true }] : [])]
      : s.c.map(([ppm, n, j]) => ({ name: p.solvent, ppm, lines: deuterated(ppm, n, j, mhz, 1.5), broad: false }));
    return peaks;
  }, [p.solvent, p.solventPeaks, p.nucleus, p.mhz]);
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
      <header onPointerDown={move.onPointerDown}>
        {/* The controls wrap onto a second row in a narrow window; Full screen and Close stay at the top right. */}
        <div className="spectrum-controls">
        <span className="segmented" role="radiogroup" aria-label="Nucleus">
          <button role="radio" aria-checked={p.nucleus === "1H"} onClick={() => p.onNucleus("1H")}>¹H</button>
          <button role="radio" aria-checked={p.nucleus === "13C"} onClick={() => p.onNucleus("13C")}>¹³C</button>
        </span>
        <Select label="Frequency" value={String(p.mhz)} options={FIELDS.map((f) => [String(f), `${f} MHz`])} onChange={(v) => p.onMhz(Number(v))} />
        <Select label="Solvent" value={p.solvent} options={SOLVENTS.map((s) => [s, s])} onChange={p.onSolvent} />
        <button className="spectrum-button" aria-pressed={p.solventPeaks} onClick={() => p.onSolventPeaks(!p.solventPeaks)} data-tip={p.solventPeaks ? "Hide the solvent's peaks" : "Show the solvent's peaks"}>Solvent peaks</button>
        <button className="spectrum-button" aria-pressed={p.details} onClick={() => p.onDetails(!p.details)} data-tip={p.details ? "Hide the details" : "How each shift was predicted, and how far to trust it"}>Details</button>
        <span className="spectrum-gap" />
        {chosen !== undefined && (
          // The clicked peak's colour, which its atoms take as a highlight too.
          <span className="spectrum-swatches" role="radiogroup" aria-label="Peak colour">
            {PEAK_COLOURS.map((c) => <button key={c} role="radio" aria-checked={p.colours[chosen] === c} aria-label={c} className="swatch" style={{ background: c }} onClick={() => p.onColour(chosen, c)} />)}
            <button role="radio" aria-checked={!p.colours[chosen]} aria-label="No colour" data-tip="No colour" className="swatch none" onClick={() => p.onColour(chosen, undefined)} />
          </span>
        )}
        <button className="spectrum-button" onClick={() => p.onColourAll(!anyColour)} disabled={!signals.length}>{anyColour ? "Clear colours" : "Colour peaks"}</button>
        <button className="spectrum-button" onClick={p.onKey} disabled={!signals.length} data-tip="Add the key (coloured shifts) under the structure">Add key</button>
        <button className="spectrum-button" onClick={() => p.onCopy(text)} disabled={!text} data-tip="Copy the characterisation line"><CopySimple size={14} /> Copy</button>
        </div>
        <div className="spectrum-window">
        <button className="actions-close" onClick={() => setExpanded(!expanded)} aria-label={expanded ? "Leave full screen" : "Full screen"} data-tip={expanded ? "Leave full screen" : "Full screen"}>{expanded ? <ArrowsIn size={14} /> : <ArrowsOut size={14} />}</button>
        <button className="actions-close" onClick={p.onClose} aria-label="Close the spectrum" data-tip="Close the spectrum"><X size={14} /></button>
        </div>
      </header>
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
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { from: e.clientX, range: [lo, hi], moved: false }; }}
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
                      <td>{s.level} {s.level === 1 ? "sphere" : "spheres"} matched, {s.based} measured, ±{s.sd.toFixed(p.nucleus === "1H" ? 2 : 1)}</td>
                      <td><span className={`quality ${q}`}>{q[0].toUpperCase() + q.slice(1)}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <button className="spectrum-button" onClick={() => p.onCopy(detailsTable(p.prediction!))}><CopySimple size={14} /> Copy table</button>
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
