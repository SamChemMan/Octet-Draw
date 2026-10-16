// Octet's one options menu. Every tool's strip, the specialist tools and every sub-menu (such as all the curved
// arrows) use it, so they all look and work the same (brand/CLAUDE.md, Menus). Each option is its icon and its full
// name, in a grid two across by default; the corner grip drags it wider or narrower in whole columns. Groups (a
// shape across its styles, say) start on a new row under a hairline. A menu taller than the window scrolls.
// Do not build another menu: extend this one.
import { useLayoutEffect, useRef, useState } from "react";

export type MenuItem = {
  key: string;
  name: string;
  icon: React.ReactNode;
  checked?: boolean;
  // A small button on the option's right, shown on hover: remove it, or keep it in a list.
  action?: { icon: React.ReactNode; label: string; pressed?: boolean; onClick: () => void };
  editing?: React.ReactNode; // in place of the name: a field to type it in
  arrived?: boolean; // it just came into the menu, so it settles in
};

export const CELL = 192, GAP = 2, PAD = 4; // px: an option's width and height, the gap and the padding
export const menuWidth = (columns: number) => columns * CELL + (columns - 1) * GAP + 2 * PAD + 2;
export const columnsFor = (width: number) => Math.max(1, Math.round((width - 2 * PAD - 2 + GAP) / (CELL + GAP)));

export const DEFAULT_COLUMNS = 2;

type Props = {
  label: string;
  groups: MenuItem[][];
  columns: number; // the columns the user chose, or defaultColumns
  onColumns?: (columns: number) => void; // the grip: saves a new column count
  onChoose: (key: string) => void;
  onPress?: (e: React.PointerEvent, key: string) => void; // a press that may become a drag onto the toolbar
  onRelease?: (key: string) => void; // the press that opened the menu let go over an option
  extra?: React.ReactNode; // whole-width rows after the options (an option's own sub-menu, a field)
  children?: React.ReactNode; // a sub-menu open beside this one
  className?: string;
  tool?: string;
  style?: React.CSSProperties;
};

export function Menu(p: Props) {
  // While the grip is dragged the menu's width follows the pointer and its options reflow as whole columns fit;
  // on release it eases to the nearest whole column.
  const [live, setLive] = useState<number>(); // width (px) while the grip is dragged
  const most = Math.max(...p.groups.map((g) => g.length), 1);
  const columns = live === undefined ? p.columns : Math.max(1, Math.min(most, Math.floor((live - 2 * PAD - 2 + GAP) / (CELL + GAP))));
  // A menu that would run off the bottom of the window moves up until it fits (never above the top).
  const box = useRef<HTMLDivElement>(null), [shift, setShift] = useState(0);
  useLayoutEffect(() => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    const top = r.top - shift, next = Math.max(8 - top, Math.min(0, innerHeight - 8 - (top + r.height)));
    if (Math.abs(next - shift) > 0.5) setShift(next);
  });
  return (
    <div ref={box} className={["strip", live !== undefined && "resizing", p.className].filter(Boolean).join(" ")} data-tool={p.tool} role="menu" aria-label={p.label}
      style={{ ...p.style, width: live ?? menuWidth(columns), marginTop: shift, "--columns": columns } as React.CSSProperties}>
      <div className="menu-body">
      {p.groups.filter((g) => g.length).map((g, i) => (
        <div key={i} className="menu-group" role="group">
          {g.map((item) => (
            <div key={item.key} className={item.arrived ? "variant-cell arrived" : "variant-cell"}>
              {item.editing ? (
                <div className="variant" role="none">{item.icon}{item.editing}</div>
              ) : (
                <button role="menuitemradio" aria-checked={!!item.checked} className="variant" title={item.name}
                  onPointerDown={(e) => p.onPress?.(e, item.key)} onClick={() => p.onChoose(item.key)} onPointerUp={() => p.onRelease?.(item.key)}>
                  {item.icon}
                  <span className="variant-name">{item.name}</span>
                </button>
              )}
              {item.action && (
                <button className="variant-action" aria-label={item.action.label} title={item.action.label} aria-pressed={item.action.pressed} onClick={item.action.onClick}>
                  {item.action.icon}
                </button>
              )}
            </div>
          ))}
        </div>
      ))}
      {p.extra && <div className="menu-group menu-extra" role="group">{p.extra}</div>}
      </div>
      {p.onColumns && (
        <span className="grip" role="separator" aria-label="Drag to resize" title="Drag to resize"
          onPointerDown={(e) => {
            // Drag the corner: the menu snaps to whole columns, from one to as many as its longest group.
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            const startX = e.clientX, start = menuWidth(p.columns);
            let width = start;
            const move = (ev: PointerEvent) => { width = Math.max(menuWidth(1), Math.min(menuWidth(most), start + ev.clientX - startX)); setLive(width); };
            const up = () => {
              removeEventListener("pointermove", move);
              removeEventListener("pointerup", up);
              p.onColumns!(Math.min(most, columnsFor(width)));
              setLive(undefined);
            };
            addEventListener("pointermove", move);
            addEventListener("pointerup", up);
          }} />
      )}
      {p.children}
    </div>
  );
}
