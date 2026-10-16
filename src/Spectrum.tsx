// The Spectrum panel: the predicted ¹H or ¹³C NMR spectrum of a structure, docked under the canvas (ChemDraw opens a
// new window; here the structure stays in view). Pointing at a peak lights its atoms on the canvas and pointing at an
// atom lights its peak. The wheel zooms the shift axis, a drag pans it and a double-click shows all of it.
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { CopySimple, X } from "@phosphor-icons/react";
import { acsText, multiplicity, type Nucleus, type Prediction, type Signal } from "./nmr";
import { Select } from "./Select";

export const SOLVENTS = ["CDCl₃", "DMSO-d₆", "CD₃OD", "D₂O", "C₆D₆", "Acetone-d₆", "CD₃CN"];
const FIELDS = [60, 80, 90, 200, 300, 400, 500, 600, 700, 800];
const HEIGHT = 184, TOP = 44, BASE = 26, PAD = 14; // px: the plot, room for labels above it and the axis below, and its ends

type Props = {
  prediction?: Prediction; nucleus: Nucleus; mhz: number; solvent: string; lit: Set<number>;
  onNucleus: (n: Nucleus) => void; onMhz: (mhz: number) => void; onSolvent: (s: string) => void;
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
  const box = useRef<HTMLDivElement>(null), [width, setWidth] = useState(600);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => setWidth(el.clientWidth);
    fit();
    const watch = new ResizeObserver(fit);
    watch.observe(el);
    return () => watch.disconnect();
  }, []);
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
  const drag = useRef<{ from: number; range: [number, number] }>(undefined);

  // The trace: ¹H as Lorentzian lines summed at each pixel (at least a pixel and a half wide, so narrow lines show
  // at any zoom); ¹³C as sticks, as tall as the carbons they count.
  const trace = useMemo(() => {
    if (p.nucleus !== "1H" || !signals.length) return undefined;
    const all = signals.flatMap((s, k) => split[k].map((l) => ({ ...l, w: Math.max((s.broad ? 12 : 0.6) / p.mhz, (0.75 * (hi - lo)) / width) })));
    const ys: number[] = [];
    for (let px = 0; px <= width; px++) {
      const v = ppmAt(px);
      ys.push(all.reduce((sum, l) => sum + (l.h * l.w * l.w) / ((v - l.ppm) ** 2 + l.w * l.w), 0));
    }
    return ys;
  }, [split, signals, p.nucleus, p.mhz, lo, hi, width]); // eslint-disable-line react-hooks/exhaustive-deps
  const top = p.nucleus === "1H" ? Math.max(1e-9, ...(trace ?? [0])) : Math.max(1, ...signals.map((s) => s.nuclei));
  const y = (v: number) => HEIGHT - BASE - (v / top) * (HEIGHT - BASE - TOP);
  const path = trace ? trace.map((v, px) => `${px ? "L" : "M"}${px} ${y(v).toFixed(1)}`).join("") : "";
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
    <section className="spectrum" aria-label="Spectrum">
      <header>
        <span className="segmented" role="radiogroup" aria-label="Nucleus">
          <button role="radio" aria-checked={p.nucleus === "1H"} onClick={() => p.onNucleus("1H")}>¹H</button>
          <button role="radio" aria-checked={p.nucleus === "13C"} onClick={() => p.onNucleus("13C")}>¹³C</button>
        </span>
        <Select label="Frequency" value={String(p.mhz)} options={FIELDS.map((f) => [String(f), `${f} MHz`])} onChange={(v) => p.onMhz(Number(v))} />
        <Select label="Solvent" value={p.solvent} options={SOLVENTS.map((s) => [s, s])} onChange={p.onSolvent} />
        <span className="spectrum-gap" />
        <button className="spectrum-button" onClick={() => p.onCopy(text)} disabled={!text} title="Copy the characterisation line"><CopySimple size={14} /> Copy</button>
        <button className="actions-close" onClick={p.onClose} aria-label="Close the spectrum" title="Close the spectrum"><X size={14} /></button>
      </header>
      <div ref={box} className="spectrum-plot">
        <svg
          width={width} height={HEIGHT} role="img" aria-label={text || "No spectrum"}
          onWheel={(e) => {
            const at = ppmAt(e.nativeEvent.offsetX), k = Math.exp(e.deltaY * 0.002), least = p.nucleus === "1H" ? 0.05 : 1;
            const span = Math.min(all[1] - all[0], Math.max(least, (hi - lo) * k)), f = (hi - at) / (hi - lo);
            const h = Math.min(all[1], Math.max(all[0] + span, at + f * span));
            setRange([h - span, h]);
          }}
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { from: e.clientX, range: [lo, hi] }; }}
          onPointerMove={(e) => {
            if (drag.current && e.buttons) {
              const [a, b] = drag.current.range, d = ((e.clientX - drag.current.from) / width) * (b - a), shift = Math.min(all[1] - b, Math.max(all[0] - a, d));
              return setRange([a + shift, b + shift]);
            }
            const k = signalAt(e.nativeEvent.offsetX);
            if (k !== pointed) { setPointed(k); p.onPoint(k === undefined ? undefined : signals[k].atoms); }
          }}
          onPointerUp={() => { drag.current = undefined; }}
          onPointerLeave={() => { if (pointed !== undefined) { setPointed(undefined); p.onPoint(undefined); } }}
          onDoubleClick={() => setRange(undefined)}
        >
          <line className="spectrum-axis" x1={PAD} x2={width - PAD} y1={HEIGHT - BASE} y2={HEIGHT - BASE} />
          {tickAt.map((v) => (
            <g key={v} className="spectrum-tick">
              <line x1={x(v)} x2={x(v)} y1={HEIGHT - BASE} y2={HEIGHT - BASE + 4} />
              <text x={x(v)} y={HEIGHT - BASE + 16} textAnchor="middle">{v.toFixed(places)}</text>
            </g>
          ))}
          <text className="spectrum-unit" x={width - 2} y={HEIGHT - 2} textAnchor="end">ppm</text>
          {signals.map((s, k) => {
            if (!on(s, k)) return null;
            const xs = split[k].map((l) => x(l.ppm)), a = Math.min(...xs), b = Math.max(...xs);
            return <rect key={k} className="spectrum-lit" x={a - 4} y={TOP - 2} width={b - a + 8} height={HEIGHT - BASE - TOP + 2} rx={3} />;
          })}
          {trace && <path className="spectrum-trace" d={path} />}
          {p.nucleus === "13C" && signals.map((s, k) => shown(s) && <line key={k} className={`spectrum-stick${on(s, k) ? " lit" : ""}`} x1={x(s.shift)} x2={x(s.shift)} y1={HEIGHT - BASE} y2={y(s.nuclei)} />)}
          {signals.map((s, k) => {
            if (!shown(s)) return null;
            const xs = split[k].map((l) => x(l.ppm)), ly = TOP - 22;
            const tip = p.nucleus === "1H" ? y(Math.max(...xs.map((px) => trace?.[Math.round(px)] ?? 0))) : y(s.nuclei);
            return (
              <g key={k} className={`spectrum-signal${on(s, k) ? " lit" : ""}`}>
                <path className="spectrum-leader" d={`M${labels[k]} ${ly + 17}L${labels[k]} ${ly + 21}L${x(s.shift)} ${Math.min(tip - 3, ly + 28)}`} />
                <text x={labels[k]} y={ly} textAnchor="middle">{s.shift.toFixed(p.nucleus === "1H" ? 2 : 1)}</text>
                <text className="spectrum-integral" x={labels[k]} y={ly + 12} textAnchor="middle">{p.nucleus === "1H" ? `${multiplicity(s)}, ${s.nuclei}H` : s.nuclei > 1 ? `${s.nuclei}C` : ""}</text>
                <title>{p.nucleus === "1H" ? `${s.shift.toFixed(2)} ppm, ${multiplicity(s)}${s.couplings.length ? `, J = ${s.couplings.map((c) => c.j.toFixed(1)).join(", ")} Hz` : ""}, ${s.nuclei}H` : `${s.shift.toFixed(1)} ppm, ${s.nuclei} C`}</title>
              </g>
            );
          })}
        </svg>
      </div>
      <footer className="spectrum-foot">
        <p className="spectrum-text">{text}</p>
        <span className="spectrum-credit" title="Contains information from nmrshiftdb2 (www.nmrshiftdb.org), made available under the nmrshiftdb2 Database License">nmrshiftdb2</span>
      </footer>
    </section>
  );
}
