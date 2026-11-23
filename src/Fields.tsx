// Octet's number field, segmented control and switch. Settings and every dialog use them, so a number, a short choice
// and an on or off setting look and work the same everywhere (brand/CLAUDE.md: one component per job).
import { useEffect, useLayoutEffect, useRef, useState } from "react";

// A number with its unit inside the field. It keeps what is being typed (such as "0." or "-") until it is a usable
// value, from min to max. Up and Down change it by step, or by ten steps with Shift. onClear: an empty field is no
// value (the placeholder shows). lazy: the value is used on Return or when the field is left, not at each key, and
// Escape puts it back as it was.
export function NumberField({ value, unit, label, onChange, min = 0.001, max = 1e6, step = 0.1, onClear, placeholder, disabled, lazy }: {
  value: number | undefined; unit?: string; label: string; onChange: (n: number) => void;
  min?: number; max?: number; step?: number; onClear?: () => void; placeholder?: string; disabled?: boolean; lazy?: boolean;
}) {
  const shown = value === undefined ? "" : String(value);
  const [text, setText] = useState(shown);
  const focused = useRef(false), cancel = useRef(false);
  useEffect(() => { if (!focused.current) setText(shown); }, [shown]);
  const ok = (n: number) => Number.isFinite(n) && n >= min && n <= max;
  return (
    <span className="unit-field" aria-disabled={disabled || undefined}>
      <input
        aria-label={label}
        inputMode={min < 0 ? "text" : "decimal"}
        value={text}
        placeholder={placeholder}
        disabled={disabled}
        onFocus={(e) => { focused.current = true; e.target.select(); }}
        onBlur={() => { focused.current = false; const n = Number(text); if (lazy && !cancel.current && text.trim() && ok(n) && n !== value) onChange(n); else setText(shown); cancel.current = false; }}
        onChange={(e) => {
          const t = e.target.value.replace(min < 0 ? /[^\d.+-]/g : /[^\d.]/g, "");
          setText(t);
          const n = Number(t);
          if (!t.trim()) onClear?.();
          else if (!lazy && t && ok(n)) onChange(n);
        }}
        onKeyDown={(e) => {
          if (lazy && (e.key === "Enter" || e.key === "Escape")) { e.preventDefault(); cancel.current = e.key === "Escape"; e.currentTarget.blur(); return; }
          if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
          e.preventDefault();
          // Rounded to the step's places (two at least), so a finer step keeps its places.
          const by = e.shiftKey ? step * 10 : step, k = 10 ** Math.max(2, (String(step).split(".")[1] ?? "").length);
          const n = Math.max(min, Math.min(max, Math.round(((value ?? (min > 0 ? min : 0)) + (e.key === "ArrowUp" ? by : -by)) * k) / k));
          setText(String(n));
          onChange(n);
        }}
      />
      {unit && <span className="unit">{unit}</span>}
    </span>
  );
}

// A line of text, used on Return or when the field is left (as a lazy NumberField), so a word typed is one change. A
// value changed elsewhere while the field has the focus shows once it is left, unless something was typed: then what
// was typed is used. lines: text of several lines (the Comment in Settings, a note), where Return makes a new line and
// Escape leaves the field; the field grows with its text up to that many lines, then scrolls. max: its length. A field
// removed while it has the focus (Escape closes Settings or clears its search, the Notes panel closes, or what a note
// was for is no longer selected) gets no blur, so it uses what was typed then. placeholder: faint text in the empty
// field ("Mixed"). onTyped: true at the first key typed, and false once what was typed is used (or was not changed).
export function TextField({ value, label, onChange, onTyped, lines, max = lines ? 10_000 : 200, placeholder }: { value: string; label: string; onChange: (text: string) => void; onTyped?: (typed: boolean) => void; lines?: number; max?: number; placeholder?: string }) {
  const [text, setText] = useState(value);
  const focused = useRef(false), typed = useRef(false), area = useRef<HTMLTextAreaElement>(null), latest = useRef({ text, onChange, onTyped });
  latest.current = { text, onChange, onTyped };
  useEffect(() => { if (!focused.current) setText(value); }, [value]);
  useEffect(() => () => { const l = latest.current; if (typed.current) { l.onChange(l.text); l.onTyped?.(false); } }, []);
  // As many rows as the text takes, up to lines.
  useLayoutEffect(() => {
    const el = area.current;
    if (!el || !lines) return;
    el.rows = 1;
    const step = parseFloat(getComputedStyle(el).lineHeight) || 18;
    el.rows = Math.max(1, Math.min(lines, Math.round(el.scrollHeight / step)));
  }, [text, lines]);
  const own = {
    "aria-label": label, value: text, maxLength: max, spellCheck: false, placeholder,
    onFocus: () => { focused.current = true; },
    onBlur: () => { focused.current = false; if (typed.current) { typed.current = false; onTyped?.(false); if (text !== value) onChange(text); } else if (text !== value) setText(value); },
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => { if (!typed.current) onTyped?.(true); typed.current = true; setText(e.target.value); },
  };
  return (
    <span className={lines ? "unit-field text lines" : "unit-field text"}>
      {lines ? <textarea ref={area} rows={1} {...own} spellCheck onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); e.currentTarget.blur(); } }} />
        : <input {...own} onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); e.currentTarget.blur(); } }} />}
    </span>
  );
}

// A short choice, as a row of buttons: one is on (or none, when the value is none of them; Tab then reaches the
// first). Left and Right move along it. An option marked off is dimmed and skipped. The on segment's fill slides to
// the new choice, as the toolbar's indicator does between tools; with reduced motion the fill fades instead.
export function Segmented<T extends string>({ label, value, options, onChange, className }: {
  label: string; value: T; options: [T, React.ReactNode, string?, boolean?, string?][]; onChange: (v: T) => void; className?: string; // the fifth: the option's key, shown in its tip
}) {
  const box = useRef<HTMLSpanElement>(null), thumb = useRef<HTMLSpanElement>(null), at = options.findIndex(([v]) => v === value);
  // The fill takes the on segment's place and size, measured as laid out (so it follows a menu dragged wider and a
  // row of segments that wraps). It is placed before it shows, so it never slides in from the corner.
  useLayoutEffect(() => {
    const place = () => {
      const el = thumb.current, on = box.current?.children[at] as HTMLElement | undefined;
      if (!el) return;
      if (!on) return void el.removeAttribute("data-on");
      Object.assign(el.style, { transform: `translate(${on.offsetLeft}px, ${on.offsetTop}px)`, width: `${on.offsetWidth}px`, height: `${on.offsetHeight}px` });
      if (!el.hasAttribute("data-on")) requestAnimationFrame(() => el.setAttribute("data-on", ""));
    };
    place();
    const watch = new ResizeObserver(place);
    if (box.current) watch.observe(box.current);
    return () => watch.disconnect();
  }, [at, options.length]);
  return (
    <span ref={box} className={className ? `segmented ${className}` : "segmented"} role="radiogroup" aria-label={label}
      onKeyDown={(e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        // With none on, Right goes to the first option and Left to the last.
        const on = options.filter((o) => !o[3]), right = e.key === "ArrowRight", k = on.findIndex(([v]) => v === value), at = k < 0 ? (right ? -1 : 0) : k;
        const next = on[(at + (right ? 1 : on.length - 1)) % on.length]?.[0];
        if (next === undefined) return;
        onChange(next);
        (e.currentTarget.children[options.findIndex(([v]) => v === next)] as HTMLElement | undefined)?.focus();
      }}>
      {options.map(([v, shown, name, off, keyHint], k) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} aria-label={name} data-tip={name} data-key={keyHint} disabled={off}
          tabIndex={value === v || (k === 0 && !options.some(([o]) => o === value)) ? 0 : -1} onClick={() => onChange(v)}>{shown}</button>
      ))}
      <span ref={thumb} className="seg-thumb" aria-hidden />
    </span>
  );
}

// An on or off setting. disabled: dimmed, and it shows the value it has.
export function Switch({ on, label, onChange, disabled }: { on: boolean; label: string; onChange: (on: boolean) => void; disabled?: boolean }) {
  // No tooltip: the switch's name is beside it.
  return <button type="button" className="switch" role="switch" aria-checked={on} aria-label={label} data-tip="" disabled={disabled} onClick={() => onChange(!on)}><span /></button>;
}
