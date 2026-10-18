// Octet's number field and segmented control. Settings and every dialog use them, so a number and a short choice
// look and work the same everywhere (brand/CLAUDE.md: one component per job).
import { useEffect, useRef, useState } from "react";

// A number with its unit inside the field. It keeps what is being typed (such as "0." or "-") until it is a usable
// value, from min to max. Up and Down change it by step, or by ten steps with Shift. onClear: an empty field is no
// value (the placeholder shows).
export function NumberField({ value, unit, label, onChange, min = 0.001, max = 1e6, step = 0.1, onClear, placeholder, disabled }: {
  value: number | undefined; unit?: string; label: string; onChange: (n: number) => void;
  min?: number; max?: number; step?: number; onClear?: () => void; placeholder?: string; disabled?: boolean;
}) {
  const shown = value === undefined ? "" : String(value);
  const [text, setText] = useState(shown);
  const focused = useRef(false);
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
        onBlur={() => { focused.current = false; setText(shown); }}
        onChange={(e) => {
          const t = e.target.value.replace(min < 0 ? /[^\d.+-]/g : /[^\d.]/g, "");
          setText(t);
          const n = Number(t);
          if (!t.trim()) onClear?.();
          else if (t && ok(n)) onChange(n);
        }}
        onKeyDown={(e) => {
          if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
          e.preventDefault();
          const by = e.shiftKey ? step * 10 : step, n = Math.max(min, Math.min(max, Math.round(((value ?? (min > 0 ? min : 0)) + (e.key === "ArrowUp" ? by : -by)) * 100) / 100));
          setText(String(n));
          onChange(n);
        }}
      />
      {unit && <span className="unit">{unit}</span>}
    </span>
  );
}

// A short choice, as a row of buttons: one is on. Left and Right move along it.
export function Segmented<T extends string>({ label, value, options, onChange, className }: {
  label: string; value: T; options: [T, React.ReactNode, string?][]; onChange: (v: T) => void; className?: string;
}) {
  return (
    <span className={className ? `segmented ${className}` : "segmented"} role="radiogroup" aria-label={label}
      onKeyDown={(e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        const k = options.findIndex(([v]) => v === value), next = options[(k + (e.key === "ArrowRight" ? 1 : options.length - 1)) % options.length][0];
        onChange(next);
        (e.currentTarget.children[options.findIndex(([v]) => v === next)] as HTMLElement | undefined)?.focus();
      }}>
      {options.map(([v, shown, name]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} aria-label={name} title={name} tabIndex={value === v ? 0 : -1} onClick={() => onChange(v)}>{shown}</button>
      ))}
    </span>
  );
}
