// Pen and touch on the canvas (issue #93, docs/plans/issue-93-pen-touch.md). The gate reads each pen and finger event
// and says what the editor does with it (Act). The mouse never comes here: the editor's own code takes it as before.
//
// - A pen draws as the mouse does. A tap is a click: moves within SLOP.pen of the press do not count. Its eraser end
//   erases (Eraser) for that stroke, and its side button opens the Actions menu once.
// - One finger acts as the mouse while no pen has been used in the window. Its press waits until it moves SLOP.touch
//   or lifts, so two fingers that land a moment apart never draw. Held still for the hold time, it opens the Actions
//   menu. Two fingers pan and zoom about their midpoint.
// - Palm rejection: touches do nothing while a pen is down or was seen in the last PALM_MS. After a pen is used, a
//   finger only moves the view.
// Pressure, tilt, twist and contact size are never read. No React and no DOM here, so node checks drive it.

export type Kind = "mouse" | "pen" | "touch";
// An unknown pointer type (or none, as a script's event has) is a mouse.
export const kindOf = (type: string): Kind => (type === "pen" || type === "touch" ? type : "mouse");
// Whether the gate reads the event: the one test on the mouse's path.
export const gated = (type: string) => type === "pen" || type === "touch";
// How far a hit reaches: every px tolerance on the canvas is multiplied by it. The mouse keeps its exact values.
export const REACH: Record<Kind, number> = { mouse: 1, pen: 1.5, touch: 2.5 };
// How far (px) a press moves before it is a drag. The mouse's 4 px is in the editor's own code.
export const SLOP: Record<Kind, number> = { mouse: 4, pen: 6, touch: 10 };
export const PALM_MS = 500; // touches after the pen was last seen that are a palm
export const SIDE_MS = 100; // the wait for the browser's own menu after the side button lets go
export const MENU_GAP_MS = 800; // a browser menu this soon after a touch or a pen's hold is the gesture's, not a new one

// What the gate reads from a pointer event.
export type In = { id: number; type: string; x: number; y: number; button: number; buttons: number; primary: boolean; t: number };
export type Act =
  | { act: "pass" } // the editor takes this event as it takes the mouse's
  | { act: "press"; id: number; x: number; y: number; tap?: true } // a finger's press, where it landed (tap: it has lifted, so let go a frame later)
  | { act: "erase" } // the pen's eraser end: this stroke erases
  | { act: "cancel" } // the press under way stops, as Escape stops it
  | { act: "view"; dx: number; dy: number; by: number; x: number; y: number } // pan by dx, dy, then zoom by `by` about x, y
  | { act: "ring"; x: number; y: number }
  | { act: "unring" }
  | { act: "menu"; x: number; y: number }
  | { act: "timer"; key: "hold" | "side"; n: number; ms: number }; // call timer(key, n) after ms

type Pt = readonly [number, number];
const finite = (e: { x: number; y: number }) => Number.isFinite(e.x) && Number.isFinite(e.y);
const far = (e: { x: number; y: number }, x: number, y: number) => Math.hypot(e.x - x, e.y - y);

// Two fingers moved from a0, b0 to a1, b1: the pan is the midpoint's move, the zoom the change in their distance, about
// the new midpoint. Undefined when nothing changes, or when a coordinate is not a number. Fingers under 1 px apart do
// not zoom.
export function pinch(a0: Pt, b0: Pt, a1: Pt, b1: Pt): { dx: number; dy: number; by: number; x: number; y: number } | undefined {
  if (![...a0, ...b0, ...a1, ...b1].every(Number.isFinite)) return undefined;
  const d0 = Math.hypot(b0[0] - a0[0], b0[1] - a0[1]), d1 = Math.hypot(b1[0] - a1[0], b1[1] - a1[1]);
  const x = (a1[0] + b1[0]) / 2, y = (a1[1] + b1[1]) / 2, dx = x - (a0[0] + b0[0]) / 2, dy = y - (a0[1] + b0[1]) / 2;
  const by = d0 >= 1 && d1 >= 1 ? d1 / d0 : 1;
  return dx || dy || by !== 1 ? { dx, dy, by, x, y } : undefined;
}

// The view after a pan by dx, dy and a zoom by `by` about x, y, within the zoom limits (clamp): the point that was under
// (x - dx, y - dy) is under (x, y). With no pan it is the wheel's zoom, number for number.
export function viewAfter(v: { x: number; y: number; zoom: number }, a: { dx: number; dy: number; by: number; x: number; y: number }, clamp: (z: number) => number) {
  const x0 = a.dx ? v.x + a.dx : v.x, y0 = a.dy ? v.y + a.dy : v.y, zoom = clamp(v.zoom * a.by), k = zoom / v.zoom;
  return { zoom, x: a.x - (a.x - x0) * k, y: a.y - (a.y - y0) * k };
}

// A hit's reach in bond lengths: the mouse's own (base), or for a pen or a finger at least 6 px times its reach on
// screen, never past cap, so an atom never covers the middle of its bonds. pxPerBond: a bond's length on screen.
export function reachIn(base: number, cap: number, reach: number, pxPerBond: number): number {
  if (reach === 1) return base;
  const floor = (6 * reach) / pxPerBond;
  return Number.isFinite(floor) ? Math.min(cap, Math.max(base, floor)) : base;
}

type Finger = { id: number; x: number; y: number; x0: number; y0: number };
// idle: no finger. wait: one finger down, nothing done yet. press: its press went to the editor. view: two fingers pan
// and zoom. pan: one finger pans (after a pen). menu: a long press opened the menu. dead: the fingers do nothing until
// they all lift.
type State = "idle" | "wait" | "press" | "view" | "pan" | "menu" | "dead";

export class Gate {
  state: State = "idle";
  fingers: Finger[] = []; // the one or two fingers followed, in the order they landed
  others = new Set<number>(); // touches that do nothing until they lift (a palm, a third finger)
  penUsed = false; // a pen has been used in this window
  pen?: { id: number; x: number; y: number; far: boolean; tip: boolean }; // the pen's press under way
  side?: { x: number; y: number; opened: boolean; up?: number }; // the side button's press, and its menu
  private penSeen = -Infinity;
  private touchSeen = -Infinity;
  private tipUp = -Infinity;
  private n = 0; // each timer's number: one from an earlier finger does nothing
  holdMs: number;
  constructor(holdMs = 350) { this.holdMs = holdMs; }

  down(e: In): Act[] {
    const kind = kindOf(e.type);
    if (kind === "mouse") return [{ act: "pass" }];
    return kind === "pen" ? this.penDown(e) : this.touchDown(e);
  }
  move(e: In): Act[] {
    const kind = kindOf(e.type);
    if (kind === "mouse") return [{ act: "pass" }];
    return kind === "pen" ? this.penMove(e) : this.touchMove(e);
  }
  up(e: In): Act[] {
    const kind = kindOf(e.type);
    if (kind === "mouse") return [{ act: "pass" }];
    return kind === "pen" ? this.penUp(e) : this.touchUp(e, false);
  }
  cancel(e: In): Act[] {
    const kind = kindOf(e.type);
    if (kind === "mouse") return [{ act: "pass" }];
    if (kind === "touch") return this.touchUp(e, true);
    this.penSeen = e.t;
    const p = this.pen;
    this.pen = undefined;
    return p && p.id === e.id ? [{ act: "cancel" }] : [];
  }
  // A timer the gate asked for has run.
  timer(key: "hold" | "side", n: number): Act[] {
    if (n !== this.n) return [];
    const f = this.fingers[0];
    if (key === "hold" && this.state === "wait" && f) {
      this.state = "menu";
      return [{ act: "unring" }, { act: "menu", x: f.x0, y: f.y0 }];
    }
    if (key === "side" && this.side && !this.side.opened) {
      this.side.opened = true;
      return [{ act: "menu", x: this.side.x, y: this.side.y }];
    }
    return [];
  }
  // The browser's own context menu event (a right-click, a pen's side button, a held finger or pen): whether to open
  // the Actions menu for it. A long press is the gate's own, and the side button's menu opens once.
  contextMenu(t: number): boolean {
    if (this.fingers.length || this.others.size || t - this.touchSeen < MENU_GAP_MS) return false;
    const s = this.side;
    if (s && (s.up === undefined || t - s.up < MENU_GAP_MS)) {
      if (s.opened) return false;
      s.opened = true;
      return true;
    }
    this.side = undefined;
    // A pen held still is hold-to-Select, as the mouse's: the system's right-click for a held pen does not open too.
    return !(this.pen?.tip || t - this.tipUp < MENU_GAP_MS);
  }
  // The window lost the pointers (blur, lost capture): everything stops.
  reset(): Act[] {
    const out: Act[] = this.state === "wait" ? [{ act: "unring" }] : this.state === "press" || this.pen ? [{ act: "cancel" }] : [];
    this.fingers = [];
    this.others.clear();
    this.state = "idle";
    this.pen = undefined;
    this.n++;
    return out;
  }

  // A pen in range: a finger's gesture under way was a palm. Its press stops; its touches do nothing until they lift.
  private palm(): Act[] {
    if (!this.fingers.length) return [];
    const out: Act[] = this.state === "wait" ? [{ act: "unring" }] : this.state === "press" ? [{ act: "cancel" }] : [];
    for (const f of this.fingers) this.others.add(f.id);
    this.fingers = [];
    this.state = "idle";
    this.n++;
    return out;
  }
  private penDown(e: In): Act[] {
    this.penUsed = true;
    this.penSeen = e.t;
    const out = this.palm();
    if (!finite(e)) return out;
    if (e.button === 2) {
      this.side = { x: e.x, y: e.y, opened: false };
      this.n++;
      return out;
    }
    this.side = undefined;
    const eraser = e.button === 5 || (e.buttons & 32) !== 0;
    this.pen = { id: e.id, x: e.x, y: e.y, far: e.button !== 0 || eraser, tip: e.button === 0 && !eraser };
    return [...out, eraser ? { act: "erase" } : { act: "pass" }];
  }
  private penMove(e: In): Act[] {
    this.penUsed = true;
    this.penSeen = e.t;
    const out = this.palm();
    if (!finite(e)) return out;
    const p = this.pen;
    if (p && p.id === e.id && !p.far) {
      if (far(e, p.x, p.y) < SLOP.pen) return out;
      p.far = true;
    }
    return [...out, { act: "pass" }];
  }
  private penUp(e: In): Act[] {
    this.penSeen = e.t;
    if (this.side && e.button === 2) {
      this.side.up = e.t;
      return this.side.opened ? [] : [{ act: "timer", key: "side", n: this.n, ms: SIDE_MS }];
    }
    const p = this.pen;
    if (!p || p.id !== e.id) return [];
    this.pen = undefined;
    if (p.tip) this.tipUp = e.t;
    return [{ act: "pass" }];
  }

  private touchDown(e: In): Act[] {
    this.touchSeen = e.t;
    // A first finger while the gate still follows others: their pointerup never came (they left the window).
    const out = e.primary && (this.fingers.length || this.others.size) ? this.reset() : [];
    if (!finite(e) || this.pen || e.t - this.penSeen < PALM_MS || this.state === "dead") {
      this.others.add(e.id);
      return out;
    }
    const f: Finger = { id: e.id, x: e.x, y: e.y, x0: e.x, y0: e.y };
    switch (this.state) {
      case "idle":
        this.fingers = [f];
        if (this.penUsed) { this.state = "pan"; return out; }
        this.state = "wait";
        this.n++;
        return [...out, { act: "ring", x: e.x, y: e.y }, { act: "timer", key: "hold", n: this.n, ms: this.holdMs }];
      case "wait":
      case "press":
      case "pan": {
        // A second finger: the two move the view. A press under way stops.
        const was = this.state;
        this.fingers.push(f);
        this.state = "view";
        this.n++;
        return [...out, ...(was === "wait" ? [{ act: "unring" } as Act] : was === "press" ? [{ act: "cancel" } as Act] : [])];
      }
      default:
        this.others.add(e.id);
        return out;
    }
  }
  private touchMove(e: In): Act[] {
    this.touchSeen = e.t;
    if (this.others.has(e.id) || !finite(e)) return [];
    const f = this.fingers.find((x) => x.id === e.id);
    if (!f) return [];
    const was: Pt = [f.x, f.y];
    switch (this.state) {
      case "wait":
        if (far(e, f.x0, f.y0) < SLOP.touch) return [];
        f.x = e.x; f.y = e.y;
        this.state = "press";
        this.n++;
        return [{ act: "unring" }, { act: "press", id: f.id, x: f.x0, y: f.y0 }];
      case "press":
        f.x = e.x; f.y = e.y;
        return [{ act: "pass" }];
      case "pan":
        f.x = e.x; f.y = e.y;
        return e.x !== was[0] || e.y !== was[1] ? [{ act: "view", dx: e.x - was[0], dy: e.y - was[1], by: 1, x: e.x, y: e.y }] : [];
      case "view": {
        const [a, b] = this.fingers, a0: Pt = [a.x, a.y], b0: Pt = [b.x, b.y];
        f.x = e.x; f.y = e.y;
        const v = pinch(a0, b0, [a.x, a.y], [b.x, b.y]);
        return v ? [{ act: "view", ...v }] : [];
      }
      default:
        f.x = e.x; f.y = e.y;
        return [];
    }
  }
  private touchUp(e: In, cancelled: boolean): Act[] {
    this.touchSeen = e.t;
    if (this.others.delete(e.id)) {
      if (!this.fingers.length && !this.others.size) this.state = "idle";
      return [];
    }
    const i = this.fingers.findIndex((x) => x.id === e.id);
    if (i < 0) return [];
    const [f] = this.fingers.splice(i, 1), was = this.state;
    this.n++;
    if (this.fingers.length) {
      // One finger of two lifted: the other, and any finger that lands now, do nothing until all lift.
      for (const g of this.fingers) this.others.add(g.id);
      this.fingers = [];
      this.state = "dead";
      return [];
    }
    this.state = "idle";
    if (was === "wait") return cancelled ? [{ act: "unring" }] : [{ act: "unring" }, { act: "press", id: f.id, x: f.x0, y: f.y0, tap: true }];
    if (was === "press") return [cancelled ? { act: "cancel" } : { act: "pass" }];
    return [];
  }
}
