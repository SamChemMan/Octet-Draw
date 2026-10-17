// The tutorial: five short steps (draw, label, hold to select, tidy, share), each a small drawing that plays on a
// loop, drawn with Octet's own renderer so it looks exactly like the app. It shows on first launch, and from
// Octet > Tutorial. Skip is at the bottom right; Escape skips, the arrow keys and Return step through.
// With reduced motion each step shows its last frame, still.
import { useEffect, useMemo, useState } from "react";
import { Cursor, Hexagon, LineSegment, Selection } from "@phosphor-icons/react";
import { measure, STYLE } from "./chem";
import { label as keyLabel } from "./keys";
import { render, type Mol } from "./render";

const K = STYLE.bond; // px per bond length, the scale every part is drawn at, so the parts line up
// The stage shows 13 bond lengths across 680 px, so the structures are large; the pointer, keys and the tool's name
// are sized in screen px through U (stage units per screen px), so they look as they do in the app.
const U = (13 * K) / 680;

// A structure from points (bond lengths, y up), bonds [a, b, order] and labels by atom.
function mol(points: number[][], bonds: number[][], labels: Record<number, string> = {}): Mol {
  return {
    atoms: points.map(([x, y], i) => ({ label: labels[i] ?? "C", location: [x, y, 0] as [number, number, number] })),
    bonds: bonds.map(([a, b, order]) => ({ type: order ?? 1, atoms: [a, b] as [number, number] })),
  };
}
// A benzene ring centred at (cx, cy), its first atom up and to the right, with Kekulé double bonds.
const ringAt = (cx: number, cy: number) => Array.from({ length: 6 }, (_, k) => [cx + Math.cos(Math.PI / 6 + (k * Math.PI) / 3), cy + Math.sin(Math.PI / 6 + (k * Math.PI) / 3)]);
const RING_BONDS = [[0, 1, 1], [1, 2, 2], [2, 3, 1], [3, 4, 2], [4, 5, 1], [5, 0, 2]];
// Aniline (or toluene, or the bare ring) with its ring centred at (cx, cy).
const benzene = (cx: number, cy: number, end?: string, wonky = false) => {
  const pts = ringAt(cx, cy);
  if (wonky) [[0.18, -0.1], [-0.12, 0.2], [0.1, 0.12], [-0.2, -0.05], [0.15, -0.2], [0.05, 0.16]].forEach(([dx, dy], k) => { pts[k][0] += dx; pts[k][1] += dy; });
  if (end === undefined) return mol(pts, RING_BONDS);
  pts.push([pts[0][0] + 0.866 + (wonky ? 0.3 : 0), pts[0][1] + 0.5 - (wonky ? 0.35 : 0)]);
  return mol(pts, [...RING_BONDS, [0, 6, 1]], end === "C" ? {} : { 6: end });
};

function Ink({ m, className, style }: { m: Mol; className?: string; style?: React.CSSProperties }) {
  const d = useMemo(() => render(m, STYLE, measure, K), [m]);
  return (
    <g className={className} style={style}>
      <path d={d.polygons.map((poly) => "M" + poly.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join("L") + "Z").join("")} />
      {d.labels.map((l, i) => <text key={i} x={l.x} y={l.y} style={{ font: `${l.size}px var(--atom-label-font)` }}>{l.text}</text>)}
    </g>
  );
}
// Where a point (bond lengths, y up) sits in the stage's own units, as a CSS translate.
const at = (x: number, y: number) => `translate(${(x * K).toFixed(1)}px, ${(-y * K).toFixed(1)}px)`;
const vars = (v: Record<string, string>) => v as React.CSSProperties;

function Pointer({ path, className = "t-cursor" }: { path: Record<string, string>; className?: string }) {
  return (
    <g className={className} style={vars(path)}>
      <g className="t-press"><Cursor size={20 * U} x={-4 * U} y={-3 * U} /></g>
    </g>
  );
}
function Key({ text, x, y, className }: { text: string; x: number; y: number; className: string }) {
  const w = Math.max(26, text.length * 9 + 14) * U;
  return (
    <g className={`t-key ${className}`} style={vars({ "--at": at(x, y) })}>
      <g className="t-key-press">
        <rect x={-w / 2} y={-13 * U} width={w} height={26 * U} rx={6 * U} strokeWidth={U} />
        <text textAnchor="middle" y={4.5 * U} style={{ fontSize: 13 * U }}>{text}</text>
      </g>
    </g>
  );
}
// The tool in use, shown in the stage's top left as the app's toolbar would.
function Tool({ icon, name, className }: { icon: React.ReactNode; name: string; className?: string }) {
  return (
    <g className={`t-tool ${className ?? ""}`}>
      <g transform={`translate(${-6.5 * K + 16 * U} ${-3 * K + 14 * U})`}>{icon}<text x={24 * U} y={14 * U} style={{ fontSize: 13 * U }}>{name}</text></g>
    </g>
  );
}

const STEPS = [
  { title: "Draw", text: "Drag to draw a bond. Click an atom with a ring tool to add a ring." },
  { title: "Label", text: "Point at an atom and press a key. N makes it a nitrogen." },
  { title: "Hold to select", text: "Press and hold on a structure with any tool. Select takes over: drag it to a new place." },
  { title: "Tidy", text: `Press ${keyLabel("mod+shift+k")} to clean up a structure.` },
  { title: "Share", text: "Copy the drawing. Paste it into Word, PowerPoint or Keynote." },
];

function Scene({ step }: { step: number }) {
  const icon = (I: typeof Cursor) => <I size={18 * U} />;
  switch (step) {
    case 0:
      return (
        <>
          <Tool className="t-draw-tool1" icon={icon(LineSegment)} name="Bond tool" />
          <Tool className="t-draw-tool2" icon={icon(Hexagon)} name="Ring tool" />
          <Ink className="t-draw-ring" m={benzene(-0.4, -0.3)} />
          <Ink className="t-draw-bond" m={mol([ringAt(-0.4, -0.3)[0], [ringAt(-0.4, -0.3)[0][0] + 0.866, ringAt(-0.4, -0.3)[0][1] + 0.5]], [[0, 1, 1]])} />
          <Pointer path={{ "--p0": at(0.466, 0.2), "--p1": at(1.332, 0.7) }} />
        </>
      );
    case 1:
      return (
        <>
          <Ink className="t-label-before" m={benzene(-0.6, -0.3, "C")} />
          <Ink className="t-label-after" m={benzene(-0.6, -0.3, "N")} />
          <Key text={keyLabel("n")} x={1.9} y={1.35} className="t-label-key" />
          <Pointer path={{ "--p0": at(-2.2, -1.4), "--p1": at(1.13, 0.7) }} />
        </>
      );
    case 2:
      return (
        <>
          <Tool className="t-hold-tool1" icon={icon(LineSegment)} name="Bond tool" />
          <Tool className="t-hold-tool2" icon={icon(Selection)} name="Select" />
          <g className="t-hold-move" style={vars({ "--to": at(2.4, 0) })}>
            <g className="t-hold-marks">{ringAt(-2, -0.2).concat([[ringAt(-2, -0.2)[0][0] + 0.866, ringAt(-2, -0.2)[0][1] + 0.5]]).map(([x, y], k) => <circle key={k} cx={x * K} cy={-y * K} r={0.34 * K} />)}</g>
            <Ink m={benzene(-2, -0.2, "N")} />
          </g>
          <circle className="t-pop" cx={-2 * K} cy={0.2 * K} r={0.9 * K} strokeWidth={2 * U} />
          <Pointer path={{ "--p0": at(-4.2, 1.6), "--p1": at(-2, -0.2), "--p2": at(0.4, -0.2) }} />
        </>
      );
    case 3:
      return (
        <>
          <Ink className="t-tidy-before" m={benzene(-0.6, -0.3, "N", true)} />
          <Ink className="t-tidy-after" m={benzene(-0.6, -0.3, "N")} />
          <Key text={keyLabel("mod+shift+k")} x={3.2} y={-1.7} className="t-tidy-key" />
        </>
      );
    default:
      return (
        <>
          <g className="t-share-page">
            <rect x={1.4 * K} y={-2.4 * K} width={3.6 * K} height={4.8 * K} rx={3} />
            {[0, 1, 2].map((k) => <line key={k} x1={1.8 * K} x2={(k === 2 ? 3.6 : 4.6) * K} y1={(-1.9 + k * 0.42) * K} y2={(-1.9 + k * 0.42) * K} />)}
            {[0, 1].map((k) => <line key={`b${k}`} x1={1.8 * K} x2={(k ? 3.9 : 4.6) * K} y1={(1.5 + k * 0.42) * K} y2={(1.5 + k * 0.42) * K} />)}
          </g>
          <Ink m={benzene(-3.4, -0.2, "N")} />
          <g className="t-share-copy" style={vars({ "--to": at(6.05, 0.05) })}>
            <g className="t-share-shrink"><Ink m={benzene(-3.4, -0.2, "N")} /></g>
          </g>
          <Key text={keyLabel("mod+c")} x={-3} y={-2} className="t-share-copykey" />
          <Key text={keyLabel("mod+v")} x={0.55} y={1.9} className="t-share-pastekey" />
        </>
      );
  }
}

export function Tutorial({ onSkip, onFinish }: { onSkip: () => void; onFinish: () => void }) {
  const [step, setStep] = useState(0), last = step === STEPS.length - 1;
  const next = () => (last ? onFinish() : setStep(step + 1));
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onSkip(); }
      else if (e.key === "ArrowRight" || e.key === "Enter") { e.preventDefault(); e.stopPropagation(); next(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); e.stopPropagation(); setStep(Math.max(0, step - 1)); }
    };
    addEventListener("keydown", key, true);
    return () => removeEventListener("keydown", key, true);
  });
  return (
    <div className="tutorial-backdrop">
      <section className="tutorial" role="dialog" aria-modal="true" aria-label="How Octet works">
        <div className="tut-stage" data-theme="light">
          <svg key={step} className={`tut-step-${step}`} viewBox={`${-6.5 * K} ${-3 * K} ${13 * K} ${6 * K}`} role="img" aria-label={STEPS[step].text}>
            <Scene step={step} />
          </svg>
        </div>
        <div className="tut-text" key={step} aria-live="polite">
          <h2>{STEPS[step].title}</h2>
          <p>{STEPS[step].text}</p>
        </div>
        <footer className="tut-foot">
          <div className="tut-nav">
            <span className="tut-dots" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
              {STEPS.map((s, k) => <button key={s.title} className="tut-dot" aria-current={k === step ? "step" : undefined} aria-label={s.title} onClick={() => setStep(k)} />)}
            </span>
            {step > 0 && <button className="dialog-button" onClick={() => setStep(step - 1)}>Back</button>}
            <button className="dialog-button primary" onClick={next} autoFocus>{last ? "Start drawing" : "Next"}</button>
          </div>
          <button className="text-button tut-skip" onClick={onSkip}>Skip</button>
        </footer>
      </section>
    </div>
  );
}
