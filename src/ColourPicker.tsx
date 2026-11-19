// Octet's colour picker: a square for how strong and how light the colour is, a strip for its hue, its hex, and the
// eyedropper. Used wherever a colour is chosen freely (Settings, Colours). There is no system colour panel anywhere in
// Octet. ColourPick, below, is Octet's one colour menu.
import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { CaretDown, Check, DotsThree, Eyedropper, FloppyDisk, Palette, PencilSimple, PushPin, PushPinSlash, Trash } from "@phosphor-icons/react";
import { holdCursor, followDrag } from "./cursor";
import { Exit, useLeaving } from "./motion";
import { ContextMenu, Pick, type MenuItem } from "./Menu";
import { UI } from "./export";
import { ADD, addColour, chosenKey, colourName, colourOptions, hexOf, moveColour, ownIndex, pin, PICK, PIN_MOST, PIN_PRESETS, pinned, pinsOf, unpin, type ColourOption, type PinKind } from "./colours";
import type { Swatch } from "./settings";

const TAURI = "__TAURI_INTERNALS__" in window, MAC = navigator.platform.startsWith("Mac");

type HSV = [number, number, number]; // hue 0–360, saturation 0–1, value 0–1

export function hexToHsv(hex: string): HSV {
  const n = parseInt(hex.slice(1), 16), r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const h = d === 0 ? 0 : max === r ? 60 * (((g - b) / d) % 6) : max === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
  return [(h + 360) % 360, max === 0 ? 0 : d / max, max];
}
export function hsvToHex([h, s, v]: HSV): string {
  const f = (k: number) => { const x = (k + h / 60) % 6; return v - v * s * Math.max(0, Math.min(x, 4 - x, 1)); };
  return "#" + [f(5), f(3), f(1)].map((c) => Math.round(c * 255).toString(16).padStart(2, "0")).join("").toUpperCase();
}

// The eyedropper (Pick from screen): a colour from anywhere on the screen where Octet can read it, else from the window.
// A web view with the EyeDropper API uses it; on macOS the app shows the system's colour sampler. Elsewhere the pointer
// becomes a crosshair over the window, with the colour under it beside it: a click takes the colour of what is drawn
// there (the drawing's own colour, not Octet's marks over it), and a press let go outside the window takes the screen's
// colour there, when the app can read it (Wayland lets no app). Escape cancels.
let picking = false; // the window's own eyedropper is out: the colour picker by it stays open
export async function pickColour(): Promise<string | undefined> {
  // It must open in the click that asks for it, so nothing waits before it does.
  if ("EyeDropper" in window) {
    try { return hexOf((await new (window as unknown as { EyeDropper: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper().open()).sRGBHex); }
    catch (e) { if ((e as DOMException).name === "AbortError") return undefined; }
  }
  if (TAURI && MAC) return (await invoke<string | null>("pick_colour").catch(() => null)) ?? undefined;
  return new Promise((done) => {
    const cover = document.body.appendChild(document.createElement("div")), chip = cover.appendChild(document.createElement("span"));
    cover.className = "eyedropper";
    chip.hidden = true;
    picking = true;
    // Every key is the eyedropper's while it is out.
    const keys = (e: KeyboardEvent) => { e.preventDefault(); e.stopImmediatePropagation(); if (e.key === "Escape") end(); };
    const end = (hex?: string) => { picking = false; cover.remove(); removeEventListener("keydown", keys, true); done(hex); };
    addEventListener("keydown", keys, true);
    cover.onpointermove = (e) => { chip.hidden = false; chip.style.cssText = `left: ${e.clientX}px; top: ${e.clientY}px; background: ${colourAt(e.clientX, e.clientY) ?? "transparent"}`; };
    cover.onpointerdown = (e) => { e.preventDefault(); cover.setPointerCapture(e.pointerId); };
    cover.onpointerup = (e) => {
      if (e.clientX >= 0 && e.clientY >= 0 && e.clientX < innerWidth && e.clientY < innerHeight) return end(colourAt(e.clientX, e.clientY));
      if (!TAURI) return end();
      void invoke<string | null>("pick_colour").then((hex) => end(hex ?? undefined), () => end());
    };
  });
}
// The colour of what is drawn at a point in the window: the outline or the fill the point is on, or a background.
function colourAt(x: number, y: number): string | undefined {
  for (const el of document.elementsFromPoint(x, y)) {
    if (el.closest(`.eyedropper,${UI}`)) continue;
    const s = getComputedStyle(el), shape = el instanceof SVGGeometryElement, m = shape ? el.getScreenCTM()?.inverse() : undefined;
    const hex = (m && (el as SVGGeometryElement).isPointInStroke(new DOMPoint(x, y).matrixTransform(m)) ? hexOf(s.stroke) : undefined) ?? hexOf(shape || el instanceof SVGTextContentElement ? s.fill : s.backgroundColor);
    if (hex) return hex;
  }
}

export function ColourPicker({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  const [hsv, setHsv] = useState<HSV>(() => hexToHsv(value));
  const [text, setText] = useState(value.toUpperCase());
  // A colour set from outside (another row picked) resets the picker; its own changes do not move the hue.
  const own = useRef(value);
  useEffect(() => { if (value !== own.current) { own.current = value; setHsv(hexToHsv(value)); setText(value.toUpperCase()); } }, [value]);
  const set = (next: HSV) => { setHsv(next); const hex = hsvToHex(next); own.current = hex; setText(hex); onChange(hex); };
  const take = (hex: string) => { own.current = hex; setHsv(hexToHsv(hex)); setText(hex); onChange(hex); };
  // Dragging in the square or along the strip: the pointer is followed until it is let go.
  const track = (e: React.PointerEvent<HTMLDivElement>, at: (x: number, y: number) => void) => {
    const box = e.currentTarget.getBoundingClientRect();
    const go = (ev: { clientX: number; clientY: number }) => at(Math.min(1, Math.max(0, (ev.clientX - box.left) / box.width)), Math.min(1, Math.max(0, (ev.clientY - box.top) / box.height)));
    go(e);
    e.currentTarget.setPointerCapture(e.pointerId);
    holdCursor(e.currentTarget);
    followDrag(go);
  };
  const [h, s, v] = hsv;
  return (
    <div className="colour-picker">
      <div className="picker-square" style={{ backgroundColor: `hsl(${h} 100% 50%)` }} role="slider" aria-label="Strength and lightness" aria-valuetext={text} tabIndex={0}
        onPointerDown={(e) => track(e, (x, y) => set([h, x, 1 - y]))}
        onKeyDown={(e) => {
          const d = e.shiftKey ? 0.1 : 0.02, k = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, d], ArrowDown: [0, -d] }[e.key];
          if (k) { e.preventDefault(); set([h, Math.min(1, Math.max(0, s + k[0])), Math.min(1, Math.max(0, v + k[1]))]); }
        }}>
        <span className="picker-knob" style={{ left: `${s * 100}%`, top: `${(1 - v) * 100}%`, background: text }} />
      </div>
      <div className="picker-hue" role="slider" aria-label="Hue" aria-valuemin={0} aria-valuemax={360} aria-valuenow={Math.round(h)} tabIndex={0}
        onPointerDown={(e) => track(e, (x) => set([x * 360, s, v]))}
        onKeyDown={(e) => {
          const d = (e.shiftKey ? 10 : 2) * (e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0);
          if (d) { e.preventDefault(); set([(h + d + 360) % 360, s, v]); }
        }}>
        <span className="picker-knob" style={{ left: `${(h / 360) * 100}%`, top: "50%", background: `hsl(${h} 100% 50%)` }} />
      </div>
      <div className="picker-row">
        <input className="picker-hex" aria-label="Hex" spellCheck={false} value={text}
          onChange={(e) => {
            const t = e.target.value.toUpperCase().replace(/[^#0-9A-F]/g, "");
            setText(t);
            const hex = (t.startsWith("#") ? t : `#${t}`).slice(0, 7);
            if (/^#[0-9A-F]{6}$/.test(hex)) take(hex);
          }}
          onKeyDown={(e) => {
            // Return takes the hex typed (as a short one, #abc, too) and the picker stays open.
            if (e.key !== "Enter") return;
            e.preventDefault();
            e.stopPropagation();
            const t = text.replace(/^#/, ""), hex = `#${t.length === 3 ? [...t].map((c) => c + c).join("") : t}`;
            if (/^#[0-9A-F]{6}$/.test(hex)) take(hex);
            else setText(hsvToHex(hsv));
          }}
          onBlur={() => setText(hsvToHex(hsv))} />
        <button className="text-button" aria-label="Pick from screen" data-tip="Pick from screen" onClick={() => void pickColour().then((hex) => hex && take(hex))}><Eyedropper size={16} /></button>
      </div>
    </div>
  );
}

// The colour picker in a small window by the button that opens it (anchor: the button's box): under the button, or
// over it when there is no room below. A click outside it (but on keep, the button) or Escape closes it. Wrap it in
// Exit: it leaves with a motion, and takes no clicks or keys on its way out.
// own and onOwn: Save to colours under the picker adds its colour to the user's colours and the picker stays open. A
// colour the user has already, or one of Octet's for this menu (presets), shows as Saved.
// name and onName: the picker changes one of the user's colours: its name above the picker, Remove under it.
export function ColourPop({ anchor, keep, label, value, onChange, onClose, own, onOwn, presets = [], name, onName, onRemove }: {
  anchor: DOMRect; keep?: HTMLElement | null; label: string; value: string; onChange: (hex: string) => void; onClose: () => void;
  own?: Swatch[]; onOwn?: (own: Swatch[]) => void; presets?: [string, string][]; name?: string; onName?: (name: string) => void; onRemove?: () => void;
}) {
  const box = useRef<HTMLDivElement>(null), close = useRef(onClose), leaving = useLeaving();
  close.current = onClose;
  useEffect(() => {
    if (leaving) return;
    // The eyedropper's clicks and its Escape are its own.
    const away = (e: PointerEvent) => { if (!picking && !box.current?.contains(e.target as Node) && !keep?.contains(e.target as Node)) close.current(); };
    // Escape closes this only, not the window it is in (Settings), whichever listener comes first (listOpen).
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape" && !picking) { e.preventDefault(); e.stopImmediatePropagation(); close.current(); keep?.focus(); } };
    addEventListener("pointerdown", away, true);
    addEventListener("keydown", esc, true);
    return () => { removeEventListener("pointerdown", away, true); removeEventListener("keydown", esc, true); };
  }, [keep, leaving]);
  const saved = [...(own ?? []).map((c) => c.hex), ...presets.map(([, h]) => h)].some((h) => h.toLowerCase() === value.toLowerCase()), tall = 260 + (onOwn || onRemove ? 36 : 0) + (onName ? 36 : 0);
  const above = anchor.bottom + tall > innerHeight - 8 && anchor.top - tall > 8;
  return (
    // Its keys are its own: Return in a field does not reach the drawing or close the picker.
    <div ref={box} className={["page-menu colour-pop", above && "above", leaving && "leaving"].filter(Boolean).join(" ")} role="dialog" aria-label={label} inert={leaving}
      style={{ left: Math.max(8, Math.min(anchor.right - 208, innerWidth - 216)), top: above ? anchor.top - 6 : anchor.bottom + 6 }}
      onKeyDown={(e) => { if (e.key !== "Escape" && e.key !== "Tab") e.stopPropagation(); }}>
      {onName && <input className="picker-name" aria-label="Name" maxLength={40} spellCheck={false} defaultValue={name} onChange={(e) => { if (e.target.value.trim()) onName(e.target.value.trim()); }} />}
      <ColourPicker value={value} onChange={onChange} />
      {onOwn && own && !onName && (
        <button className="dialog-button picker-save" aria-disabled={saved || undefined} onClick={() => { if (!saved) onOwn(addColour(own, value)); }}>
          {saved ? <Check size={16} aria-hidden /> : <FloppyDisk size={16} aria-hidden />}{saved ? "Saved" : "Save to colours"}
        </button>
      )}
      {onRemove && <button className="dialog-button picker-save" onClick={onRemove}><Trash size={16} aria-hidden />Remove</button>}
    </div>
  );
}

// A colour menu's options as the menu's options: each colour as its swatch (None as an empty one), in a grid, and Pick
// from screen and Custom colour… as rows. key: an option's key in that menu; value: the colour chosen now, ringed.
const MORE = "\u0000more";
export const colourItems = (groups: ColourOption[][], key = (o: ColourOption) => o.key, value?: string): MenuItem[][] => {
  const chosen = value === undefined ? undefined : chosenKey(groups, value);
  return groups.map((g) => g.map((o): MenuItem => ({ key: key(o), name: o.name, checked: chosen !== undefined && o.key === chosen, swatch: o.key !== PICK && o.key !== ADD,
    icon: o.key === PICK ? <Eyedropper size={18} /> : o.key === ADD ? <Palette size={18} /> : <span className={o.hex ? "swatch" : "swatch none"} style={o.hex ? { background: o.hex } : undefined} /> })));
};
// The user's colours show two rows of swatches and the drawing's one; a last swatch (+9) shows the rest of them.
const SHOWN: Record<number, number> = { 1: 16, 2: 8 };

// Octet's one colour menu (Sam, 19 November 2026). strip: a row in the Actions panel: its name, the pinned colours as
// swatches (one click puts a colour on), then a button with the colour chosen now that opens every colour. Without
// strip: that button only (field: drawn as the fields beside it, a Settings row, with the colour's name). Every colour
// is a swatch: Octet's for this menu, the user's own and the drawing's, each once; then Pick from screen and Custom
// colour…. Custom colour… opens the picker by the button: the colour changes as the picker does, and Save to colours
// keeps it. A right-click on a colour pins it to the row or unpins it; on one of the user's own it edits (name and
// colour) or removes it too, and the user's own drag into a new order. A press keeps the focus where it is, so text
// being typed takes the colour.
export function ColourPick({ label, value, presets, none, own, drawing = [], onPick, onOwn, field, strip, pins, onPins }: {
  label: string; value: string; // the colour chosen now (#RRGGBB), or "none"
  presets: [string, string][]; none?: boolean; // the preset colours, after None where it applies (Highlight, Ring fill)
  field?: boolean;
  own: Swatch[]; drawing?: Swatch[]; onOwn: (own: Swatch[]) => void; // the user's own colours, and the drawing's after them
  onPick: (hex: string, live?: boolean) => void; // live: a change in the picker while it is open (one step to undo)
  strip?: boolean; // a row with the pinned colours
  pins?: Partial<Record<PinKind, string[]>>; onPins?: (pins: Partial<Record<PinKind, string[]>>) => void; // the pinned colours of each kind of row
}) {
  const box = useRef<HTMLDivElement>(null), held = useRef({ own, onOwn }), shut = useRef<() => void>(undefined);
  held.current = { own, onOwn };
  const [adding, setAdding] = useState<{ anchor: DOMRect; from: string; hex: string }>(), [editing, setEditing] = useState<{ anchor: DOMRect; at: number }>();
  const [manage, setManage] = useState<{ key: string; hex?: string; at: { x: number; y: number }; keyboard: boolean }>(), [shown, setShown] = useState<number[]>([]);
  // The kind of row these colours pin to: the one whose colours this menu offers.
  const kind = (Object.keys(PIN_PRESETS) as PinKind[]).find((k) => PIN_PRESETS[k] === presets) ?? "ink", room = none ? PIN_MOST - 1 : PIN_MOST;
  const row = pinsOf(pins ?? {}, kind, room);
  // The lists are made again only when a colour in them changes: the drawing's colours come new with every edit.
  const drawn = drawing.map((c) => c.name + c.hex).join("\n");
  const options = useMemo(() => colourOptions(presets, own, drawing, value, none), [presets, own, drawn, value, none]); // eslint-disable-line react-hooks/exhaustive-deps
  const chosen = chosenKey(options, value), current = options.flat().find((o) => o.key === chosen);
  const items = useMemo(() => colourItems(options, undefined, value).map((g, k) => {
    // A long group shows its first rows and a swatch for the rest, unless it is open or has the colour chosen now further on.
    const most = SHOWN[k];
    if (!most || g.length <= most || shown.includes(k) || g.slice(most - 1).some((i) => i.checked)) return g;
    return [...g.slice(0, most - 1), { key: `${MORE}${k}`, name: `Show ${g.length - most + 1} more`, swatch: true, icon: <span className="swatch more"><DotsThree size={12} /></span> }];
  }), [options, value, shown]);
  const hexOfKey = (key: string) => options.flat().find((o) => o.key === key)?.hex;
  const choose = (key: string) => {
    if (key === PICK) return void pickColour().then((hex) => hex && onPick(hex));
    if (key === ADD) { const from = /^#[0-9a-f]{6}$/i.test(value) ? value : "#3F6BFF"; return setAdding({ anchor: box.current!.getBoundingClientRect(), from, hex: from }); }
    onPick(hexOfKey(key) ?? "none");
  };
  // Show the rest of a group: the list stays open, and the focus goes on to the first colour that was hidden.
  const keep = (key: string) => {
    if (!key.startsWith(MORE)) return false;
    const k = Number(key.slice(MORE.length)), first = options[k][SHOWN[k] - 1]?.key, focused = document.activeElement?.getAttribute("data-item") === key;
    setShown((s) => [...s, k]);
    if (focused && first) requestAnimationFrame(() => document.querySelector<HTMLElement>(`.strip.list [data-item="${CSS.escape(first)}"]`)?.focus());
    return true;
  };
  // A press on one of the user's own colours that moves is a drag: the colour moves along the grid as the pointer passes
  // the others, and the click it ends with chooses nothing.
  const press = (e: React.PointerEvent, key: string) => {
    let list = held.current.own, at = ownIndex(key, list), moved = false;
    if (at < 0 || e.button !== 0) return;
    const x = e.clientX, y = e.clientY;
    const move = (ev: PointerEvent) => {
      moved ||= Math.hypot(ev.clientX - x, ev.clientY - y) > 4;
      const to = moved ? ownIndex(document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>("[data-item]")?.dataset.item, list) : -1;
      if (to >= 0 && to !== at) { list = moveColour(list, at, to); at = to; held.current.onOwn(list); }
    };
    const up = () => {
      if (!moved) return;
      const swallow = (ev: Event) => ev.stopPropagation();
      addEventListener("click", swallow, true);
      setTimeout(() => removeEventListener("click", swallow, true));
    };
    followDrag(move, up);
  };
  // A colour's own menu (a right-click, the Menu key or Shift+F10): pin or unpin it, and edit or remove one of the
  // user's own; a colour from the drawing can be saved to the user's colours.
  const menuFor = (key: string, at: { x: number; y: number }, keyboard: boolean) => {
    const hex = key === "none" || key.startsWith(MORE) ? undefined : hexOfKey(key) ?? key;
    if (hex && /^#[0-9a-f]{6}$/i.test(hex)) setManage({ key, hex, at, keyboard });
  };
  const k = manage ? own.findIndex((c) => c.hex.toLowerCase() === manage.hex?.toLowerCase()) : -1, isPinned = !!manage && pinned(row, manage.hex);
  const manageGroups: MenuItem[][] = manage ? [
    [...(onPins ? [isPinned ? { key: "unpin", name: "Unpin", icon: <PushPinSlash size={18} /> } : { key: "pin", name: "Pin", icon: <PushPin size={18} /> }] : []),
      ...(k >= 0 ? [{ key: "edit", name: "Edit…", icon: <PencilSimple size={18} /> }] : presets.some(([, h]) => h.toLowerCase() === manage.hex?.toLowerCase()) ? [] : [{ key: "save", name: "Save to colours", icon: <FloppyDisk size={18} /> }])],
    ...(k >= 0 ? [[{ key: "remove", name: "Remove", icon: <Trash size={18} /> }]] : []),
  ] : [];
  const manageChoose = (c: string) => {
    const hex = manage!.hex!;
    if (c === "pin" || c === "unpin") onPins?.({ ...pins, [kind]: c === "pin" ? pin(row, hex, room) : unpin(row, hex) });
    if (c === "save") onOwn(addColour(own, hex));
    if (c === "remove") onOwn(own.filter((_, j) => j !== k));
    if (c === "edit") { shut.current?.(); setEditing({ anchor: box.current!.getBoundingClientRect(), at: k }); }
  };
  const list = (
    <Pick label={label} value={chosen ?? value} groups={items} onPick={choose} onPress={press} onItemMenu={menuFor} onKeep={keep} shut={shut}
      className={field ? "select-field" : strip ? "chip colour-more" : "chip pick-button"} title={`${label}: ${current?.name ?? colourName(value, presets, own, drawing)}`}>
      {!strip && <span className={field ? undefined : "pick-label"} aria-hidden>{field ? current?.name ?? value : label}</span>}
      <span className={current?.hex ? "pick-swatch" : "pick-swatch none"} style={current?.hex ? { background: current.hex } : undefined} />
      {strip && <CaretDown size={12} aria-hidden />}
    </Pick>
  );
  // The pinned colours: one tab stop, the arrow keys go along them, Return or Space puts one on.
  const swatches = strip && (
    <div className="colour-pins" role="toolbar" aria-label={`${label} colours`}
      onKeyDown={(e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        const all = [...e.currentTarget.querySelectorAll<HTMLElement>(".swatch-cell")], at = all.indexOf(document.activeElement as HTMLElement);
        e.preventDefault();
        e.stopPropagation();
        all[Math.max(0, Math.min(all.length - 1, at + (e.key === "ArrowLeft" ? -1 : 1)))]?.focus();
      }}>
      {[...(none ? ["none"] : []), ...row].map((hex, j, all) => {
        const on = hex === "none" ? value === "none" : value.toLowerCase() === hex.toLowerCase(), name = colourName(hex, presets, own, drawing);
        const first = all.findIndex((h) => (h === "none" ? value === "none" : value.toLowerCase() === h.toLowerCase()));
        return (
          <button key={hex} className="variant swatch-cell" aria-pressed={on} aria-label={name} data-tip={name} tabIndex={j === Math.max(0, first) ? 0 : -1}
            onClick={() => { if (!on) onPick(hex); }}
            onContextMenu={(e) => { e.preventDefault(); if (hex !== "none") setManage({ key: hex, hex, at: { x: e.clientX, y: e.clientY }, keyboard: false }); }}
            onKeyDown={(e) => {
              if (hex === "none" || !(e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey))) return;
              e.preventDefault();
              const r = e.currentTarget.getBoundingClientRect();
              setManage({ key: hex, hex, at: { x: r.left + r.width / 2, y: r.bottom - 8 }, keyboard: true });
            }}>
            <span className={hex === "none" ? "swatch none" : "swatch"} style={hex === "none" ? undefined : { background: hex }} />
          </button>
        );
      })}
    </div>
  );
  return (
    <div className={strip ? "pick colour-row" : "pick"} ref={box} onMouseDown={(e) => { if (!(e.target as Element).closest("input, .colour-pop")) e.preventDefault(); }}>
      {strip && <span className="colour-row-name" aria-hidden>{label}</span>}
      {swatches}
      {list}
      <Exit>{adding && <ColourPop anchor={adding.anchor} keep={box.current} label={`${label} colour`} value={adding.hex} own={own} onOwn={onOwn} presets={presets}
        onChange={(hex) => { setAdding((a) => a && { ...a, hex }); onPick(hex, true); }} onClose={() => setAdding(undefined)} />}</Exit>
      <Exit>{editing && own[editing.at] && <ColourPop anchor={editing.anchor} keep={box.current} label={`Edit ${own[editing.at].name}`} value={own[editing.at].hex} name={own[editing.at].name}
        onName={(name) => held.current.onOwn(held.current.own.map((c, j) => (j === editing.at ? { ...c, name } : c)))}
        onChange={(hex) => {
          // A colour pinned follows its change.
          const was = held.current.own[editing.at].hex;
          held.current.onOwn(held.current.own.map((c, j) => (j === editing.at ? { ...c, hex } : c)));
          if (onPins && pinned(row, was)) onPins({ ...pins, [kind]: row.map((h) => (h.toLowerCase() === was.toLowerCase() ? hex : h)) });
        }}
        onRemove={() => { held.current.onOwn(held.current.own.filter((_, j) => j !== editing.at)); setEditing(undefined); }} onClose={() => setEditing(undefined)} />}</Exit>
      {manage && manageGroups.length > 0 && (
        <ContextMenu label={colourName(manage.hex!, presets, own, drawing)} at={manage.at} keyboard={manage.keyboard} sub={() => undefined} onClose={() => setManage(undefined)}
          groups={manageGroups} onChoose={manageChoose} />
      )}
    </div>
  );
}
