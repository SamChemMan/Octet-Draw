// Export: a button that stays at the top right of the window. It opens a menu with Quick export as PNG (straight to
// the Save dialog, with the saved PNG settings) and Export…, which shows the settings first: what to export, the
// format, a PNG's resolution and background, the margin, and a preview with the size it will come out at.
import { useEffect, useRef, useState } from "react";
import { DownloadSimple, Export as ExportIcon, ImageSquare } from "@phosphor-icons/react";
import { Dialog } from "./Dialog";
import { Menu } from "./Menu";
import { Select } from "./Select";
import { NumberField, Segmented } from "./Fields";
import { withMargin, type ExportFormat } from "./export";
import { DPIS, type FilePrefs } from "./SettingsWindow";

export function ExportButton({ onQuick, onExport, hint }: { onQuick: () => void; onExport: () => void; hint?: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const escape = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); setOpen(false); } };
    addEventListener("pointerdown", away, true);
    addEventListener("keydown", escape, true);
    return () => { removeEventListener("pointerdown", away, true); removeEventListener("keydown", escape, true); };
  }, [open]);
  return (
    <div className="export" ref={box}>
      <button className="export-button" aria-haspopup="menu" aria-expanded={open} title={hint ? `Export (${hint})` : "Export"} onClick={() => setOpen(!open)}>
        <ExportIcon size={16} aria-hidden />
        Export
      </button>
      {open && (
        <Menu label="Export" className="export-menu" columns={1}
          groups={[[{ key: "quick", name: "Quick export as PNG", icon: <ImageSquare size={18} /> }, { key: "export", name: "Export…", icon: <DownloadSimple size={18} /> }]]}
          onChoose={(key) => { setOpen(false); if (key === "quick") onQuick(); else onExport(); }} />
      )}
    </div>
  );
}

const FORMATS: [ExportFormat, string][] = [["oct", "Octet drawing (.oct)"], ["pdf", "PDF"], ["png", "PNG"], ["svg", "SVG"], ["cdxml", "CDXML (ChemDraw)"], ["cdx", "CDX (ChemDraw)"], ["mol", "MOL"], ["sdf", "SDF"], ["smi", "SMILES"], ["inchi", "InChI"]];
const PICTURES: ExportFormat[] = ["pdf", "png", "svg"];
export type ExportSettings = Pick<FilePrefs, "dpi" | "background" | "margin"> & { format: ExportFormat };

// The settings before saving. pictures: the picture of the whole drawing and, when something is selected, of the
// selection (standaloneSvg, in pt, no margin). Changes are kept as the next export's defaults.
export function ExportDialog({ prefs, onPrefs, pictures, chemistry, onExport, onClose }: {
  prefs: ExportSettings; onPrefs: (p: Partial<ExportSettings>) => void;
  pictures: { all?: string; selection?: string };
  chemistry: (part: "all" | "selection") => Partial<Record<ExportFormat, boolean>>;
  onExport: (part: "all" | "selection") => void; onClose: () => void;
}) {
  const [part, setPart] = useState<"all" | "selection">(pictures.selection ? "selection" : "all");
  const has = chemistry(part), picture = pictures[part], format = prefs.format;
  const usable = FORMATS.filter(([f]) => (PICTURES.includes(f) ? !!picture : has[f]));
  const isPicture = PICTURES.includes(format), svg = picture && isPicture ? withMargin(picture, prefs.margin) : undefined;
  const size = svg ? (/viewBox="[-\d.]+ [-\d.]+ ([\d.]+) ([\d.]+)"/.exec(svg) ?? []).slice(1).map(Number) : [];
  const mm = (pt: number) => Math.round((pt * 25.4) / 72);
  const ok = usable.some(([f]) => f === format);
  return (
    <Dialog title="Export" action="Export…" onClose={onClose} onAction={() => { if (ok) onExport(part); }}>
      <div className={["export-preview", format === "png" && prefs.background === "transparent" && "transparent"].filter(Boolean).join(" ")}>
        {svg ? <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`} alt="Preview" /> : <span className="export-none">{ok ? FORMATS.find(([f]) => f === format)?.[1] : "Nothing to export in this format"}</span>}
      </div>
      {size.length === 2 && (
        <p className="export-size">
          {mm(size[0])} × {mm(size[1])} mm{format === "png" ? ` · ${Math.round((size[0] * prefs.dpi) / 72).toLocaleString()} × ${Math.round((size[1] * prefs.dpi) / 72).toLocaleString()} px` : ""}
        </p>
      )}
      {pictures.selection && (
        <Segmented label="What to export" value={part} onChange={setPart} options={[["all", "Whole drawing"], ["selection", "Selection"]]} />
      )}
      <label className="dialog-row"><span>Format</span>
        <Select label="Format" value={format} options={usable.length ? usable : FORMATS} onChange={(v) => onPrefs({ format: v as ExportFormat })} />
      </label>
      {format === "png" && (
        <label className="dialog-row"><span>Resolution</span>
          <Select label="Resolution" value={String(prefs.dpi)} options={DPIS} onChange={(v) => onPrefs({ dpi: Number(v) })} />
        </label>
      )}
      {format === "png" && (
        <label className="dialog-row"><span>Background</span>
          <Select label="Background" value={prefs.background} options={[["transparent", "Transparent"], ["white", "White"]]} onChange={(v) => onPrefs({ background: v as FilePrefs["background"] })} />
        </label>
      )}
      {isPicture && (
        <label className="dialog-row"><span>Margin</span>
          <NumberField label="Margin" unit="pt" min={0} max={72} step={1} value={prefs.margin} onChange={(n) => onPrefs({ margin: n })} />
        </label>
      )}
    </Dialog>
  );
}
