// Octet's one select: its look over the native control (which keeps keyboard and screen reader behaviour).
import { CaretUpDown } from "@phosphor-icons/react";

export function Select({ value, label, options, onChange }: { value: string; label: string; options: [string, string][]; onChange: (v: string) => void }) {
  return (
    <span className="select-field">
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, name]) => <option key={v} value={v}>{name}</option>)}
      </select>
      <CaretUpDown size={12} aria-hidden />
    </span>
  );
}
