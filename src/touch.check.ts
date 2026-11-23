// Run: node src/touch.check.ts. Pen and touch on the canvas (touch.ts, issue #93): the gate's answer to sequences of
// pen and finger events, the two-finger pan and zoom, the coarse hit reach, and the cost of the test on the mouse's
// path. The editor's side of it (what each answer does to the drawing) is checked in WebKit: npm run look --
// <dev server> touch (scripts/look/touch.js).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Gate, gated, kindOf, MENU_GAP_MS, PALM_MS, pinch, pinchView, REACH, reachIn, SIDE_MS, SLOP, viewAfter, type Act, type In, type PinchFrom } from "./touch.ts";
import { atomAt, bondAt, markNear } from "./edit.ts";
import { markIn, tieAt } from "./arrowlink.ts";

type P2 = [number, number];

let clock = 0;
const ev = (type: string, id: number, x: number, y: number, more: Partial<In> = {}): In => ({ id, type, x, y, button: 0, buttons: 1, primary: true, t: (clock += 16), ...more });
const acts = (list: Act[]) => list.map((a) => a.act).join(" ");
const H = 350;

// ——— Pen ———
{
  // The tip draws as the mouse: its press and release pass. A tap is a click: moves within 6 px of the press do not
  // reach the editor, so its 4 px drag test never sees them.
  const g = new Gate(H);
  assert.equal(acts(g.down(ev("pen", 2, 100, 100))), "pass");
  assert.equal(acts(g.move(ev("pen", 2, 104, 103))), "", "a pen's 5 px shake is no drag");
  assert.equal(acts(g.move(ev("pen", 2, 100, 105.9))), "");
  assert.equal(acts(g.move(ev("pen", 2, 106, 100))), "pass", "6 px is a drag");
  assert.equal(acts(g.move(ev("pen", 2, 101, 100))), "pass", "once a drag, every move counts");
  assert.equal(acts(g.up(ev("pen", 2, 101, 100, { buttons: 0 }))), "pass");
  // Hover passes (the hover marks, as the mouse's).
  assert.equal(acts(g.move(ev("pen", 2, 300, 300, { buttons: 0 }))), "pass");
  assert.equal(SLOP.pen, 6);
}
{
  // Pressure, tilt, twist and size are never read: junk values give the same answers.
  const plain = new Gate(H), junk = new Gate(H);
  const extra = (e: In) => ({ ...e, pressure: NaN, tiltX: 90, tiltY: -900, twist: 359, width: 0, height: Infinity, tangentialPressure: 1.7 }) as In;
  for (const [kind, e] of [["down", ev("pen", 3, 10, 10)], ["move", ev("pen", 3, 30, 10)], ["move", ev("pen", 3, 31, 12)], ["up", ev("pen", 3, 31, 12)]] as const) {
    assert.deepEqual(junk[kind](extra(e)), plain[kind](e), `junk pen values, ${kind}`);
  }
}
{
  // The eraser end (button 5, or buttons 32 in a move) erases for its stroke; each move counts at once.
  for (const more of [{ button: 5, buttons: 32 }, { button: 0, buttons: 32 }]) {
    const g = new Gate(H);
    assert.equal(acts(g.down(ev("pen", 4, 50, 50, more))), "erase");
    assert.equal(acts(g.move(ev("pen", 4, 51, 50, more))), "pass");
    assert.equal(acts(g.up(ev("pen", 4, 51, 50, { button: 5, buttons: 0 }))), "pass");
  }
  // The middle button of a pen (a second side button on Windows) pans as the mouse's middle button does.
  const g = new Gate(H);
  assert.equal(acts(g.down(ev("pen", 5, 0, 0, { button: 1, buttons: 4 }))), "pass");
  assert.equal(acts(g.move(ev("pen", 5, 1, 0, { buttons: 4 }))), "pass");
}
{
  // The side button opens the Actions menu once: by the browser's own menu event, or 100 ms after release when none came.
  const g = new Gate(H);
  assert.equal(acts(g.down(ev("pen", 6, 200, 120, { button: 2, buttons: 2 }))), "", "the side button presses nothing");
  const up = g.up(ev("pen", 6, 200, 120, { button: 2, buttons: 0 }));
  assert.equal(acts(up), "timer");
  const timer = up[0] as Extract<Act, { act: "timer" }>;
  assert.equal(timer.key, "side");
  assert.equal(timer.ms, SIDE_MS);
  assert.deepEqual(g.timer("side", timer.n), [{ act: "menu", x: 200, y: 120 }], "no menu event: the gate opens it");
  assert.equal(g.contextMenu(clock + 50), false, "a menu event after it does not open a second");
  // With the browser's own menu event before the wait ends.
  const h = new Gate(H);
  h.down(ev("pen", 6, 10, 10, { button: 2, buttons: 2 }));
  const t = h.up(ev("pen", 6, 10, 10, { button: 2, buttons: 0 }))[0] as Extract<Act, { act: "timer" }>;
  assert.equal(h.contextMenu(clock + 5), true, "the menu event opens it");
  assert.deepEqual(h.timer("side", t.n), [], "and the wait opens nothing");
  assert.equal(h.contextMenu(clock + 10), false, "once");
  // The event on the press (Mac and Linux send it on the press).
  const k = new Gate(H);
  k.down(ev("pen", 6, 10, 10, { button: 2, buttons: 2 }));
  assert.equal(k.contextMenu(clock + 1), true);
  assert.deepEqual(k.up(ev("pen", 6, 10, 10, { button: 2, buttons: 0 })), [], "released after its menu opened: nothing to wait for");
  // Long after, a mouse right-click opens its menu as ever.
  assert.equal(k.contextMenu(clock + MENU_GAP_MS + 100), true);
}
{
  // A pen held still is hold-to-Select: the system's own right-click for a held pen does not open the menu as well.
  const g = new Gate(H);
  g.down(ev("pen", 7, 10, 10));
  assert.equal(g.contextMenu(clock + 400), false);
  g.up(ev("pen", 7, 10, 10, { buttons: 0 }));
  assert.equal(g.contextMenu(clock + 300), false);
  assert.equal(g.contextMenu(clock + MENU_GAP_MS + 1), true);
  // A mouse right-click with no pen or finger about.
  assert.equal(new Gate(H).contextMenu(1e6), true);
}
{
  // A pen's cancel (the system takes the pen) stops its press; a cancel with no press does nothing.
  const g = new Gate(H);
  g.down(ev("pen", 8, 0, 0));
  assert.equal(acts(g.cancel(ev("pen", 8, 0, 0))), "cancel");
  assert.equal(acts(g.cancel(ev("pen", 8, 0, 0))), "");
}

// ——— One finger ———
{
  // A tap: the ring shows, and the lift presses where the finger landed and lets go a frame later.
  const g = new Gate(H), down = g.down(ev("touch", 11, 300, 200));
  assert.equal(acts(down), "ring timer");
  assert.deepEqual(down[0], { act: "ring", x: 300, y: 200 });
  assert.equal((down[1] as Extract<Act, { act: "timer" }>).ms, H, "the hold time is the mouse's");
  assert.equal(acts(g.move(ev("touch", 11, 306, 205))), "", "under 10 px the press waits");
  assert.deepEqual(g.up(ev("touch", 11, 306, 205, { buttons: 0 })), [{ act: "unring" }, { act: "press", id: 11, x: 300, y: 200, tap: true }]);
  assert.equal(g.state, "idle");
}
{
  // A drag: past 10 px the press goes in where the finger landed; then each move and the lift pass.
  const g = new Gate(H);
  g.down(ev("touch", 12, 300, 200));
  assert.deepEqual(g.move(ev("touch", 12, 311, 200)), [{ act: "unring" }, { act: "press", id: 12, x: 300, y: 200 }]);
  assert.equal(acts(g.move(ev("touch", 12, 340, 200))), "pass");
  assert.equal(acts(g.up(ev("touch", 12, 340, 200, { buttons: 0 }))), "pass");
  assert.equal(SLOP.touch, 10);
}
{
  // A long press opens the Actions menu where the finger is; lifting chooses nothing and a drag after it draws nothing
  // (stress 12).
  const g = new Gate(H);
  const t = g.down(ev("touch", 13, 50, 60))[1] as Extract<Act, { act: "timer" }>;
  g.move(ev("touch", 13, 53, 62));
  assert.deepEqual(g.timer("hold", t.n), [{ act: "unring" }, { act: "menu", x: 50, y: 60 }]);
  assert.equal(acts(g.move(ev("touch", 13, 200, 300))), "");
  assert.equal(acts(g.up(ev("touch", 13, 200, 300))), "");
  // The browser's own menu for the held finger does not open a second.
  assert.equal(g.contextMenu(clock + 10), false);
  // A hold timer from a finger that moved off, or lifted, does nothing.
  const h = new Gate(H), n = (h.down(ev("touch", 14, 0, 0))[1] as Extract<Act, { act: "timer" }>).n;
  h.move(ev("touch", 14, 20, 0));
  assert.deepEqual(h.timer("hold", n), []);
  const k = new Gate(H), m = (k.down(ev("touch", 15, 0, 0))[1] as Extract<Act, { act: "timer" }>).n;
  k.up(ev("touch", 15, 0, 0));
  k.down(ev("touch", 16, 0, 0));
  assert.deepEqual(k.timer("hold", m), [], "the first finger's timer, run after a second tap");
}
{
  // Stress 11: ten taps a second on one atom: one press and release for each.
  const g = new Gate(H);
  let presses = 0;
  for (let k = 0; k < 10; k++) {
    g.down(ev("touch", 100 + k, 400, 400));
    presses += g.up(ev("touch", 100 + k, 401, 400)).filter((a) => a.act === "press").length;
    clock += 84;
  }
  assert.equal(presses, 10);
}

// ——— Two fingers ———
{
  // Stress 1: two fingers 120 ms apart: no press ever reaches the editor, the view pans and zooms.
  const g = new Gate(H);
  g.down(ev("touch", 21, 100, 100));
  clock += 120;
  assert.equal(acts(g.down(ev("touch", 22, 200, 100, { primary: false }))), "unring");
  const v = g.move(ev("touch", 22, 300, 100, { primary: false }));
  assert.equal(acts(v), "view");
  const a = v[0] as Extract<Act, { act: "view" }>;
  assert.equal(a.by, 2);
  assert.deepEqual([a.x, a.y, a.dx, a.dy], [200, 100, 50, 0]);
  const all = [...g.move(ev("touch", 21, 80, 120)), ...g.up(ev("touch", 21, 80, 120)), ...g.move(ev("touch", 22, 0, 0)), ...g.up(ev("touch", 22, 0, 0))];
  assert.ok(!all.some((x) => x.act === "press" || x.act === "pass"), "nothing drawn");
  assert.equal(g.state, "idle");
}
{
  // Stress 2: a second finger after the first started a drag cancels it, as Escape does, then pans.
  const g = new Gate(H);
  g.down(ev("touch", 23, 100, 100));
  g.move(ev("touch", 23, 150, 100));
  g.move(ev("touch", 23, 200, 100));
  assert.equal(acts(g.down(ev("touch", 24, 100, 300, { primary: false }))), "cancel");
  assert.equal(acts(g.move(ev("touch", 23, 210, 100))), "view");
  assert.equal(acts(g.up(ev("touch", 23, 210, 100))), "", "the drag never lets go: it was cancelled");
}
{
  // Stress 4: a third touch (a palm) does nothing, and its lift first leaves the two fingers' gesture as it was.
  const g = new Gate(H);
  g.down(ev("touch", 31, 0, 0));
  g.down(ev("touch", 32, 100, 0, { primary: false }));
  assert.deepEqual(g.down(ev("touch", 33, 500, 500, { primary: false })), []);
  assert.deepEqual(g.move(ev("touch", 33, 600, 500, { primary: false })), []);
  assert.deepEqual(g.up(ev("touch", 33, 600, 500, { primary: false })), []);
  assert.equal(acts(g.move(ev("touch", 32, 120, 0, { primary: false }))), "view");
  assert.equal(g.state, "view");
}
{
  // Stress 4: one finger of a pinch lifts: the other does nothing, nor does a finger landing then, until all lift; the
  // next touch starts afresh with no jump.
  const g = new Gate(H);
  g.down(ev("touch", 41, 0, 0));
  g.down(ev("touch", 42, 100, 0, { primary: false }));
  g.up(ev("touch", 41, 0, 0));
  assert.deepEqual(g.move(ev("touch", 42, 300, 300, { primary: false })), []);
  assert.deepEqual(g.down(ev("touch", 43, 0, 0, { primary: false })), []);
  assert.deepEqual(g.move(ev("touch", 43, 50, 0, { primary: false })), []);
  g.up(ev("touch", 42, 300, 300));
  g.up(ev("touch", 43, 50, 0));
  assert.equal(g.state, "idle");
  assert.equal(acts(g.down(ev("touch", 44, 10, 10))), "ring timer");
}
{
  // Stress 5: NaN and infinite coordinates: the touch does nothing, the view is never NaN.
  const g = new Gate(H);
  assert.deepEqual(g.down(ev("touch", 51, NaN, 0)), []);
  assert.deepEqual(g.move(ev("touch", 51, 10, 10)), []);
  g.up(ev("touch", 51, 0, 0));
  g.down(ev("touch", 52, 0, 0));
  g.down(ev("touch", 53, 0, 0, { primary: false }));
  assert.deepEqual(g.move(ev("touch", 53, Infinity, 0, { primary: false })), []);
  const v = g.move(ev("touch", 53, 0, 0.5, { primary: false }));
  assert.ok(v.every((a) => a.act !== "view" || (a.by === 1 && Number.isFinite(a.dx + a.dy + a.x + a.y))), "fingers on one spot do not zoom");
}
{
  // Stress 6: a cancel (an edge swipe) during a finger's drag stops it; before its press, only the ring goes.
  const g = new Gate(H);
  g.down(ev("touch", 61, 0, 0));
  g.move(ev("touch", 61, 30, 0));
  assert.equal(acts(g.cancel(ev("touch", 61, 30, 0))), "cancel");
  g.down(ev("touch", 62, 0, 0));
  assert.equal(acts(g.cancel(ev("touch", 62, 0, 0))), "unring");
  assert.equal(g.state, "idle");
}
{
  // Stress 6: a pointerup that never came (the finger left the window), then a new first finger: the old one is
  // dropped, and the new one starts as any first finger. reset() (blur, lost capture) does the same.
  const g = new Gate(H);
  g.down(ev("touch", 71, 0, 0));
  g.move(ev("touch", 71, 40, 0));
  assert.equal(acts(g.down(ev("touch", 72, 500, 500))), "cancel ring timer");
  assert.equal(g.fingers.length, 1);
  assert.equal(acts(g.reset()), "unring");
  assert.equal(g.state, "idle");
}

// ——— Palm rejection ———
{
  // Stress 7: a palm lands and starts a press, then the pen comes down: the palm's press stops, the pen presses, and
  // the palm does nothing until it lifts.
  const g = new Gate(H);
  g.down(ev("touch", 81, 0, 0));
  g.move(ev("touch", 81, 20, 0));
  assert.equal(acts(g.down(ev("pen", 9, 300, 300))), "cancel pass");
  assert.deepEqual(g.move(ev("touch", 81, 40, 0)), []);
  assert.deepEqual(g.up(ev("touch", 81, 40, 0)), []);
  // A palm still waiting when the pen comes: its ring goes, nothing presses.
  const h = new Gate(H);
  h.down(ev("touch", 82, 0, 0));
  assert.equal(acts(h.move(ev("pen", 9, 300, 300, { buttons: 0 }))), "unring pass");
  assert.deepEqual(h.up(ev("touch", 82, 0, 0)), []);
}
{
  // Stress 7: the pen hovering, a palm resting and moving: nothing from the palm.
  const g = new Gate(H);
  g.move(ev("pen", 9, 300, 300, { buttons: 0 }));
  assert.deepEqual(g.down(ev("touch", 83, 0, 0)), []);
  assert.deepEqual(g.move(ev("touch", 83, 50, 0)), []);
  assert.deepEqual(g.up(ev("touch", 83, 50, 0)), []);
  // While the pen is down, also past the palm time.
  g.down(ev("pen", 9, 300, 300));
  clock += PALM_MS * 2;
  assert.deepEqual(g.down(ev("touch", 84, 0, 0)), []);
}
{
  // After a pen, one finger only pans (no ring, no press, no menu), two fingers pan and zoom.
  const g = new Gate(H);
  g.move(ev("pen", 9, 0, 0, { buttons: 0 }));
  clock += PALM_MS + 1;
  assert.deepEqual(g.down(ev("touch", 85, 100, 100)), [], "no ring");
  assert.deepEqual(g.move(ev("touch", 85, 130, 90)), [{ act: "view", dx: 30, dy: -10, by: 1, x: 130, y: 90 }]);
  assert.deepEqual(g.up(ev("touch", 85, 130, 90)), [], "a tap does nothing");
  g.down(ev("touch", 86, 0, 0));
  g.down(ev("touch", 87, 100, 0, { primary: false }));
  assert.equal(acts(g.move(ev("touch", 87, 200, 0, { primary: false }))), "view");
  // Stress 16: in another window (its own gate) a finger still draws.
  const other = new Gate(H);
  assert.equal(acts(other.down(ev("touch", 88, 0, 0))), "ring timer");
}
{
  // Stress 10: an unknown pointer type is a mouse; the mouse passes straight through.
  for (const type of ["", "mouse", "eraser", "stylus", "PEN"]) assert.equal(kindOf(type), "mouse", type);
  assert.equal(kindOf("pen"), "pen");
  assert.equal(kindOf("touch"), "touch");
  assert.ok(!gated("mouse") && !gated("") && gated("pen") && gated("touch"));
  const g = new Gate(H);
  for (const kind of ["down", "move", "up", "cancel"] as const) assert.equal(acts(g[kind](ev("", 1, 0, 0))), "pass");
  assert.equal(g.penUsed, false);
  // Stress 7's gate side: a finger's touches while a mouse is about are the gate's own; the editor ignores the mouse
  // while the finger presses (WebKit check).
  assert.equal(acts(g.down(ev("mouse", 1, 0, 0))), "pass");
  assert.equal(acts(g.down(ev("touch", 89, 0, 0))), "ring timer");
}
{
  // A finger's touch then a right-click: the browser's menu event for the touch is the gate's; long after, the mouse's
  // opens its menu.
  const g = new Gate(H);
  g.down(ev("touch", 91, 0, 0));
  assert.equal(g.contextMenu(clock + 1), false);
  g.up(ev("touch", 91, 0, 0));
  assert.equal(g.contextMenu(clock + MENU_GAP_MS - 1), false);
  assert.equal(g.contextMenu(clock + MENU_GAP_MS + 1), true);
}

// ——— Pinch maths ———
{
  // The point under the fingers' midpoint stays under it, up to the zoom limits; with no pan it is the wheel's zoom
  // exactly (the same numbers, as Editor.tsx's wheel calls the same function).
  const clamp = (z: number) => Math.min(8, Math.max(0.25, z));
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < 10000; k++) {
    const v = { x: rnd() * 2000 - 1000, y: rnd() * 2000 - 1000, zoom: 0.25 + rnd() * 7.75 };
    const a0: [number, number] = [rnd() * 1400, rnd() * 900], b0: [number, number] = [rnd() * 1400, rnd() * 900];
    const a1: [number, number] = [a0[0] + rnd() * 80 - 40, a0[1] + rnd() * 80 - 40], b1: [number, number] = [b0[0] + rnd() * 80 - 40, b0[1] + rnd() * 80 - 40];
    const p = pinch(a0, b0, a1, b1);
    if (!p) continue;
    const w = viewAfter(v, p, clamp);
    assert.ok(Number.isFinite(w.x + w.y + w.zoom));
    assert.ok(w.zoom >= 0.25 && w.zoom <= 8);
    // The drawing's point under the old midpoint, (m0 - v) / zoom, is under the new midpoint.
    const m0 = [(a0[0] + b0[0]) / 2, (a0[1] + b0[1]) / 2], q = [(m0[0] - v.x) / v.zoom, (m0[1] - v.y) / v.zoom];
    if (clamp(v.zoom * p.by) === v.zoom * p.by) for (const i of [0, 1]) assert.ok(Math.abs(q[i] * w.zoom + [w.x, w.y][i] - [p.x, p.y][i]) < 1e-6, "the point stays under the fingers");
    // The wheel's own sum, kept from before.
    const by = 0.8 + rnd() * 0.4, x = rnd() * 1400, y = rnd() * 900, zoom = clamp(v.zoom * by), kk = zoom / v.zoom;
    assert.deepEqual(viewAfter(v, { dx: 0, dy: 0, by, x, y }, clamp), { zoom, x: x - (x - v.x) * kk, y: y - (y - v.y) * kk });
  }
  // Stress 5: past the limit the zoom stops and the pan goes on.
  const w = viewAfter({ x: 0, y: 0, zoom: 8 }, { dx: 30, dy: -20, by: 1.5, x: 500, y: 400 }, clamp);
  assert.equal(w.zoom, 8);
  assert.deepEqual([w.x, w.y], [30, -20]);
  // Stress 5: one spot, or not numbers.
  assert.equal(pinch([5, 5], [5, 5], [5, 5], [5.5, 5])?.by ?? 1, 1);
  assert.equal(pinch([0, 0], [NaN, 0], [0, 0], [10, 0]), undefined);
  assert.equal(pinch([0, 0], [10, 0], [0, 0], [10, 0]), undefined, "nothing moved");
}
{
  // Two fingers pan by (60, 40), each event moving one finger, as Chromium sends them. They end as far apart as they
  // started: the zoom stays to the bit and the view moves by the pan exactly. Steps from each event's last places add
  // up rounding (1.25 became 1.2500000000000022 in Chrome).
  const clamp = (z: number) => Math.min(8, Math.max(0.25, z));
  const g = new Gate(H), v0 = { x: 720, y: 406.5, zoom: 1.25 };
  g.down(ev("touch", 71, 550, 450));
  g.down(ev("touch", 72, 750, 450, { primary: false }));
  let v = v0, from: PinchFrom | undefined, steps = v0;
  const at: Record<number, P2> = { 71: [550, 450], 72: [750, 450] };
  for (let k = 1; k <= 10; k++) {
    for (const [id, x0] of [[72, 750], [71, 550]]) {
      const was = { ...at }, now: P2 = [x0 + 6 * k, 450 + 4 * k];
      at[id] = now;
      const step = pinch(was[71], was[72], at[71], at[72]);
      if (step) steps = viewAfter(steps, step, clamp);
      for (const a of g.move(ev("touch", id, ...now, { primary: id === 71 }))) {
        assert.ok(a.act === "view" && a.n !== undefined, "two fingers' sums");
        if (a.act === "view" && a.n !== undefined) ({ view: v, from } = pinchView(from, v, { ...a, n: a.n }, clamp));
      }
    }
  }
  assert.deepEqual(v, { x: 780, y: 446.5, zoom: 1.25 }, "a two-finger pan keeps the zoom and moves by the pan");
  assert.notEqual(steps.zoom, 1.25, "steps add up rounding");
  // A new gesture starts from the view it finds.
  const next = pinchView(from, { x: 0, y: 0, zoom: 2 }, { dx: 0, dy: 0, by: 1, x: 5, y: 5, n: from!.n + 1 }, clamp);
  assert.deepEqual(next.view, { x: 0, y: 0, zoom: 2 });
}
{
  // Past a zoom limit the fingers' way back zooms at once, as a step from the limit does; and the point under the
  // fingers at the start stays under them in random gestures that stay within the limits.
  const clamp = (z: number) => Math.min(8, Math.max(0.25, z));
  let r = pinchView(undefined, { x: 0, y: 0, zoom: 6 }, { dx: 0, dy: 0, by: 2, x: 100, y: 100, n: 1 }, clamp);
  assert.equal(r.view.zoom, 8);
  r = pinchView(r.from, r.view, { dx: 0, dy: 0, by: 3, x: 100, y: 100, n: 1 }, clamp);
  assert.equal(r.view.zoom, 8);
  r = pinchView(r.from, r.view, { dx: 0, dy: 0, by: 1.5, x: 100, y: 100, n: 1 }, clamp);
  assert.equal(r.view.zoom, 4, "half the spread back halves the zoom");
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  let kept = 0;
  for (let k = 0; k < 2000; k++) {
    const v = { x: rnd() * 2000 - 1000, y: rnd() * 2000 - 1000, zoom: 0.5 + rnd() * 3 }, a0: P2 = [rnd() * 1400, rnd() * 900], b0: P2 = [rnd() * 1400, rnd() * 900];
    const g = new Gate(H);
    g.down(ev("touch", 1, ...a0));
    g.down(ev("touch", 2, ...b0, { primary: false }));
    let from: PinchFrom | undefined, w = v;
    const at: [P2, P2] = [a0, b0];
    for (let j = 0; j < 6; j++) {
      const i = j % 2;
      at[i] = [at[i][0] + rnd() * 40 - 20, at[i][1] + rnd() * 40 - 20];
      for (const a of g.move(ev("touch", i + 1, ...at[i], { primary: i === 0 }))) if (a.act === "view" && a.n !== undefined) ({ view: w, from } = pinchView(from, w, { ...a, n: a.n }, clamp));
    }
    assert.ok(Number.isFinite(w.x + w.y + w.zoom) && w.zoom >= 0.25 && w.zoom <= 8);
    const m0 = [(a0[0] + b0[0]) / 2, (a0[1] + b0[1]) / 2], m1 = [(at[0][0] + at[1][0]) / 2, (at[0][1] + at[1][1]) / 2], q = [(m0[0] - v.x) / v.zoom, (m0[1] - v.y) / v.zoom];
    if (from?.v.x === v.x && from.v.y === v.y && from.v.zoom === v.zoom) {
      kept++;
      for (const i of [0, 1]) assert.ok(Math.abs(q[i] * w.zoom + [w.x, w.y][i] - m1[i]) < 1e-6, "the point stays under the fingers");
    }
  }
  assert.ok(kept > 1000, `${kept} gestures within the limits`);
}

// ——— Coarse reach ———
{
  // The mouse keeps its exact values at every zoom; a pen and a finger reach further, within the caps.
  assert.equal(REACH.mouse, 1);
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const L = 19.2; // px per bond length at 100% (Editor.tsx L)
  for (let k = 0; k < 10000; k++) {
    const zoom = 0.05 + rnd() * 10, px = L * zoom;
    assert.equal(reachIn(0.3, 0.4, REACH.mouse, px), 0.3);
    assert.equal(reachIn(0.2, 0.5, REACH.mouse, px), 0.2);
    for (const n of [2, 3, 4, 5, 6, 8, 11]) assert.equal((n * REACH.mouse) / zoom, n / zoom, "a px tolerance times the mouse's reach");
    for (const r of [REACH.pen, REACH.touch]) {
      const atom = reachIn(0.3, 0.4, r, px), bond = reachIn(0.2, 0.5, r, px);
      assert.ok(atom >= 0.3 && atom <= 0.4 && bond >= 0.2 && bond <= 0.5);
      assert.ok(atom < 0.5, "an atom never covers the middle of its bonds");
    }
  }
  // Stress 14: at 8x the floors add nothing; at 0.25x a finger's reach is at its caps.
  assert.equal(reachIn(0.3, 0.4, REACH.touch, L * 8), 0.3);
  assert.equal(reachIn(0.3, 0.4, REACH.touch, L * 0.25), 0.4);
  assert.equal(reachIn(0.2, 0.5, REACH.touch, L * 0.25), 0.5);
  assert.equal(reachIn(0.3, 0.4, REACH.touch, 0), 0.3, "no size on screen: the mouse's value");
  assert.equal(reachIn(0.3, 0.4, REACH.touch, NaN), 0.3);
  // A benzene ring: a tap in its middle hits nothing; between two atoms of a ring, the nearer.
  const ring = { atoms: Array.from({ length: 6 }, (_, i) => ({ label: "C", location: [Math.cos((i * Math.PI) / 3), Math.sin((i * Math.PI) / 3), 0] as [number, number, number] })), bonds: Array.from({ length: 6 }, (_, i) => ({ type: 1, atoms: [i, (i + 1) % 6] as [number, number] })) };
  for (const zoom of [0.25, 0.5, 1, 2, 8]) {
    const ra = reachIn(0.3, 0.4, REACH.touch, L * zoom), rb = reachIn(0.2, 0.5, REACH.touch, L * zoom);
    assert.equal(atomAt(ring, [0, 0], ra), undefined);
    assert.equal(bondAt(ring, [0, 0], rb), undefined, `nothing in the ring's middle at ${zoom}x`);
    assert.equal(atomAt(ring, [0.62, 0.3], ra) ?? 0, 0, "the nearer atom, or the bond");
  }
  // A charge (issue 164) half a bond from its atom: the mouse takes it within 0.2, a finger within its reach (at most
  // 0.4), and neither takes a press nearer the atom.
  const charged = { atoms: [{ label: "N", location: [0, 0, 0] as [number, number, number], charge: 1 }], bonds: [] };
  const sign = [{ atom: 0, at: [0.5 * L, -0] as [number, number], key: "charge" }];
  for (const zoom of [0.25, 1, 2, 8]) {
    const rm = reachIn(0.2, 0.4, REACH.touch, L * zoom);
    assert.ok(rm >= 0.2 && rm <= 0.4);
    assert.equal(markNear(sign, charged, [0.68, 0], L, 0.2)?.mark, "charge");
    assert.equal(markNear(sign, charged, [0.24, 0], L, rm), undefined, `the atom's side of the middle at ${zoom}x`);
    assert.equal(markNear(sign, charged, [0.5 + 0.9 * rm, 0], L, rm)?.mark, "charge", `a finger just off the charge at ${zoom}x`);
  }
  assert.equal(markNear(sign, charged, [0.75, 0], L, 0.2), undefined, "the mouse's own reach");
  assert.equal(reachIn(0.2, 0.4, REACH.mouse, L), 0.2);
  // A curved arrow's end on a lone pair (#143, tieAt and electronAt): the mouse within 0.3, as before; a finger within
  // an atom's reach, but never on a press nearer the atom (a bare carbanion's pair sits 0.39 out).
  const anion = { atoms: [{ label: "C", location: [0, 0, 0] as [number, number, number] }, { label: "C", location: [-1, 0, 0] as [number, number, number] }], bonds: [{ type: 1, atoms: [0, 1] as [number, number] }] };
  const pair = [{ atom: 0, at: [0.39, 0] as [number, number], key: "pair0" }];
  for (let k = 0; k < 2000; k++) { const d = rnd() * 0.6, q: P2 = [rnd() - 0.5, rnd() - 0.5]; assert.equal(markIn(d, 0.3, [0, 0, 0], q), d < 0.3, "the mouse's lone pair reach"); }
  for (const zoom of [0.25, 1, 2, 8]) {
    const ra = reachIn(0.3, 0.4, REACH.touch, L * zoom), atom = (m: typeof anion, q: P2) => atomAt(m, q, ra), bond = (m: typeof anion, q: P2) => bondAt(m, q, reachIn(0.2, 0.5, REACH.touch, L * zoom));
    assert.deepEqual(tieAt(anion, [0, 0], pair, atom, bond, ra), { atom: 0 }, `a finger on the atom takes the atom at ${zoom}x`);
    assert.deepEqual(tieAt(anion, [0.39 + 0.9 * ra, 0], pair, atom, bond, ra), { atom: 0, pair: "pair0" }, `a finger just off the pair at ${zoom}x`);
  }
  assert.deepEqual(tieAt(anion, [0.1, 0], pair, atomAt, bondAt), { atom: 0, pair: "pair0" }, "the mouse takes the pair within 0.3, as before");
}

// ——— Cost on the mouse's path ———
{
  // The mouse's events pass one test (gated) before the editor's own code. Its time on a pointer move is under a budget
  // of 0.0005 ms (a pointermove's work is over 0.1 ms), and the gate's own work for a pen or a finger's move is too.
  // Calls go in batches of 1000 between clock reads (a clock read costs more than the test), the best of 5 runs, and
  // up to 5 more runs when a busy machine puts the first over budget (perf.check.ts does the same).
  const run = (f: () => unknown) => { let n = 0; const t0 = performance.now(); do { for (let j = 0; j < 1000; j++) f(); n += 1000; } while (performance.now() - t0 < 15); return (performance.now() - t0) / n; };
  const time = (f: () => unknown, budget = Infinity) => { f(); let best = Infinity; for (let k = 0; k < 10 && (k < 5 || best > budget); k++) best = Math.min(best, run(f)); return best; };
  const types = ["mouse", "mouse", "pen", "touch", ""];
  let i = 0;
  const mouse = time(() => gated(types[i++ % 2]), 0.0005);
  assert.ok(mouse < 0.0005, `the mouse's test: ${mouse} ms`);
  const g = new Gate(H);
  g.down(ev("touch", 1, 0, 0));
  g.down(ev("touch", 2, 100, 0, { primary: false }));
  let x = 0;
  const pinchMove = time(() => g.move({ id: 2, type: "touch", x: 100 + (x++ % 50), y: 0, button: -1, buttons: 1, primary: false, t: 0 }), 0.005);
  assert.ok(pinchMove < 0.005, `a pinch move: ${pinchMove} ms`);
  const p = new Gate(H);
  const hover = time(() => p.move({ id: 3, type: "pen", x: x++ % 500, y: 0, button: -1, buttons: 0, primary: true, t: 0 }), 0.005);
  assert.ok(hover < 0.005, `a pen hover move: ${hover} ms`);
  // Growth: a long gesture costs the same per move (the gate keeps two fingers, not their history).
  const long = new Gate(H);
  long.down(ev("touch", 1, 0, 0));
  long.down(ev("touch", 2, 100, 0, { primary: false }));
  for (let k = 0; k < 100000; k++) long.move({ id: 2, type: "touch", x: 100 + (k % 50), y: 0, button: -1, buttons: 1, primary: false, t: 0 });
  const later = time(() => long.move({ id: 2, type: "touch", x: 100 + (x++ % 50), y: 0, button: -1, buttons: 1, primary: false, t: 0 }));
  assert.ok(later < pinchMove * 10 + 0.001, `after 100 000 moves: ${later} ms against ${pinchMove} ms`);
}

// ——— The editor's wiring ———
{
  const editor = readFileSync(new URL("Editor.tsx", import.meta.url), "utf8");
  // The canvas takes every pointer event through one handler each; the mouse's path tests the type, then the owner.
  assert.match(editor, /onPointerDown=\{onDown\}/);
  assert.match(editor, /onPointerMove=\{onMove\}/);
  assert.match(editor, /onPointerUp=\{onUp\}/);
  assert.match(editor, /onPointerCancel=\{onCancel\}/);
  const move = editor.slice(editor.indexOf("function onMove("), editor.indexOf("\n  }\n", editor.indexOf("function onMove(")));
  assert.match(move, /if \(gated\(e\.pointerType\)\) return follow\(e, gate\.move\(read\(e\)\)\);\n\s*if \(owner\.current !== undefined\) return;\n\s*reach\.current = 1;\n\s*onPointerMove\(e\);/, "the mouse's move: a type test and an owner test, then as before");
  // Every hit tolerance in px takes the reach.
  for (const site of ["const cycleAt", "const arrowAt", "const shapeAt", "const tickAt", "const spotHit", "const lineHit", "const tableEdge", "const captionAt", "const labelAt", "const handleAt", "const joinAt", "const resizeAt", "const onTurnHandle", "const onCentreMark", "const pageEdgeAt", "const measureAt"]) {
    const at = editor.indexOf(site);
    assert.ok(at > 0, site);
    assert.match(editor.slice(at, editor.indexOf("\n  }", at) > 0 ? Math.min(editor.indexOf("\n  };", at), at + 900) : at + 900), /reach\.current/, `${site} takes the reach`);
  }
  // No px value over the zoom is left without the reach, so a hit test added later (a new tool's, a merged branch's)
  // fails here until it takes it. These few snap, place a mark or start a drag, or only draw (the Measure tool's
  // live line), and do not hit anything.
  const NOT_HITS = ["pad = 4 / zoom", "+ 14 / zoom", "Math.hypot(d[0], d[1]) * L * views.get().zoom < 3", "resizeBy(drag.frame", "snapBoxes(boxes.moving", "const tol = 6 / (views.get().zoom * L);",
    "r={3 / zoom} />", "strokeWidth={2 / zoom} strokeDasharray={`0 ${6 / zoom}`}", "style={{ fontSize: 12 / zoom }}"];
  const px = [/(?<![\w.)*] ?)\b\d+(\.\d+)? \/ \(?(L \* )?(views\.get\(\)\.zoom|zoom\b)/, /zoom\)? < \d+(\.\d+)?(?! \* reach)\b/, /(?<![\w.)*] ?)\b\d+ \/ L \/ views\.get\(\)\.zoom/,
    /(?<![\w.)*] ?)\b\d+(\.\d+)? \/ \((?:[^()]|\(\))*zoom/];
  const bare = editor.split("\n").filter((l) => px.some((r) => r.test(l)) && !l.includes("reach.current") && !NOT_HITS.some((n) => l.includes(n)));
  assert.deepEqual(bare.map((l) => l.trim()), [], "a px tolerance without the pen's and the finger's reach");
  assert.ok(editor.includes("const tol = (3 * reach.current) / (views.get().zoom * L);"), "a reagent table's line takes the reach");
  // Hits in bond lengths take a pen's and a finger's reach too: a charge, radical or lone pair (markNear, and an arrow's
  // end on one), and the atom or bond a curved arrow's end ties to where it is let go (dropArrows).
  assert.match(editor, /const markReach = \(\) => \(reach\.current === 1 \? 0\.2 : reachIn\(0\.2, 0\.4, reach\.current, L \* views\.get\(\)\.zoom\)\);/);
  const marks = editor.match(/markNear\([^)]*\)/g) ?? [];
  assert.ok(marks.length >= 4 && marks.every((c) => c.endsWith(", markReach()")), `every markNear takes the mark's reach: ${marks.join("; ")}`);
  assert.match(editor, /const arrowEndAt = \(p: P\) => \{ const r = markReach\(\);/);
  const drop = editor.slice(editor.indexOf("const dropArrows"), editor.indexOf("\n  };", editor.indexOf("const dropArrows")));
  assert.match(drop, /tieAt\(m, q, marks, \(x, p\) => still\(atomAt\(x, p, atomReach\(\)\)\), \(x, p\) => \{ const k = bondAt\(x, p, bondReach\(\)\);.*\}, atomReach\(\)\);/, "a curved arrow's end ties with the reach");
  const electron = editor.slice(editor.indexOf("const electronAt"), editor.indexOf("\n  };", editor.indexOf("const electronAt")));
  assert.match(electron, /const r = atomReach\(\), near = .*\.filter\(\(x\) => markIn\(x\.d, r, doc\.atoms\[x\.e\.atom\]\?\.location, p\)\)/, "a curved arrow starts on a lone pair with the reach");
  // The atom or bond a tool lands on (hitAt) takes the reach. The Measure tool's end goes on the atom hitAt finds (or
  // the one the pointer's move found), and a free end within 4 px of the last, times the reach, is that end again.
  assert.match(editor, /const hitAt = \(p: P\): Hover => \{\n\s*const t = reach\.current === 1 \? hitIn\(doc, p\) : hitIn\(doc, p, atomReach\(\), bondReach\(\)\);/, "hitAt takes the reach");
  assert.match(editor, /const nextEnd = \(ends: End\[\], p: P\) => \{ const h = measureHit\.current, on = h && h\.at === p && h\.doc === doc \? h\.atom : hitAt\(p\)\.atom; return placeEnd\(ends, measureChoice, on, p, \(4 \* reach\.current\) \/ L \/ views\.get\(\)\.zoom\); \};/, "a Measure end takes the reach");
  // A right-click, a long press and the side button open the menu through one openMenu, which stops a measurement
  // under way as the right-click does.
  assert.match(editor, /function openMenu\(clientX: number, clientY: number\) \{\n\s*setMeasuring\(undefined\);\n\s*if \(drag \|\| writing\) return;/, "every menu stops a measurement under way");
  // The page never zooms with a pinch: the canvas takes raw touches, and the root pans only, so menus and cards on body
  // are covered too (touch-action is not inherited: the chain up to the root decides).
  const css = readFileSync(new URL("editor.css", import.meta.url), "utf8");
  assert.match(css, /\.canvas \{[^}]*touch-action: none;/);
  assert.match(css, /(^|\n):root \{[^}]*touch-action: pan-x pan-y;/);
  for (const [rule, value] of css.matchAll(/touch-action: ([^;]+);/g)) assert.ok(value === "none" || value === "pan-x pan-y", `no rule lets a pinch zoom the window: ${rule}`);
  // A coarse main pointer: the toolbar and every Menu.tsx menu (each is a .strip) take --size-touch for each size.
  const coarse = /:root\[data-pointer="coarse"\] \.palette,\n:root\[data-pointer="coarse"\] \.strip \{([^}]*)\}/.exec(css);
  assert.ok(coarse, "the coarse rule covers the toolbar and every menu");
  for (const size of ["tool", "cell", "row"]) assert.match(coarse[1], new RegExp(`--size-${size}: var\\(--size-touch\\);`));
  const tokens = readFileSync(new URL("../brand/tokens.css", import.meta.url), "utf8"), json = readFileSync(new URL("../brand/tokens.json", import.meta.url), "utf8");
  assert.match(tokens, /--size-touch: 44px;/);
  assert.match(json, /"name": "size-touch", "value": "44px"/);
  // The toolbar's active mark and the menus' heights come from the tokens, not from a fixed 32 or 36 px.
  const tools = readFileSync(new URL("tools.tsx", import.meta.url), "utf8"), menu = readFileSync(new URL("Menu.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(tools, /\* 36\}px/);
  // In the toolbar's section (Pen and Measure between two lines) too: each tool steps by a tool and a gap, a line by 13 px.
  assert.doesNotMatch(tools, /(col|row) \* 36\b/);
  assert.match(tools, /const at = \{ line, col, x: `calc\(\$\{col\} \* \$\{STEP\}\)`, y: `calc\(\$\{row\} \* \$\{STEP\} \+ \$\{lines \* 13\}px\)` \};/);
  assert.doesNotMatch(menu, /\.length \* 32 \+/);
  assert.match(css, /\.indicator \{[^}]*width: var\(--size-tool\);\n\s*height: var\(--size-tool\);/);
  // main.tsx follows the main pointer.
  const main = readFileSync(new URL("main.tsx", import.meta.url), "utf8");
  assert.match(main, /matchMedia\("\(pointer: coarse\)"\)/);
  // A finger's tap: Chromium's mousedown for it comes after the gate's press and took the focus from a field the tap
  // opened. The canvas cancels a finger's pointerdown, so no mousedown comes, and the press moves the focus as the
  // mouse's mousedown does. The finger's leave as it lifts waits for its tap's release (the name field lands there).
  const down = editor.slice(editor.indexOf("function onDown("), editor.indexOf("\n  }\n", editor.indexOf("function onDown(")));
  assert.match(down, /if \(gated\(e\.pointerType\)\) \{\n(\s*\/\/.*\n)*\s*if \(e\.pointerType === "touch"\) e\.preventDefault\(\);\n\s*return follow\(e, gate\.down\(read\(e\)\)\);/, "a finger's pointerdown sends no mousedown");
  assert.match(editor, /send\("pointerdown", a\.id, a\.x, a\.y, "touch"\);\n(\s*\/\/.*\n)*\s*queueMicrotask\(\(\) => \(document\.activeElement as HTMLElement \| null\)\?\.blur\?\.\(\)\);/, "a finger's press moves the focus");
  assert.match(editor, /if \(finger && e\.pointerId === owner\.current\) requestAnimationFrame\(leave\);\n\s*else leave\(\);/, "a finger's leave waits a frame for its tap's release");
  // A finger leaves no hover behind: its leave clears the hover whatever drag it reads. For a tap, that drag is the
  // one from before the tap's release, which put the hover back.
  assert.match(editor, /const finger = e\.pointerType === "touch";\n\s*const leave = \(\) => \{ pointer\.current = undefined; pointers\.set\(undefined\); setBrush\(undefined\); if \(\(finger \|\| !drag\) && !hovers\.get\(\)\.key\) setHover\(\{\}\); \};/, "a finger leaves no hover");
  // A finger's double tap: Chromium's dblclick for it can come before the second tap's release. It goes in again once
  // the release has, as the mouse's comes after its mouseup.
  const dbl = editor.slice(editor.indexOf("onDoubleClick={(e) => {"));
  assert.match(dbl, /^onDoubleClick=\{\(e\) => \{\n\s*twice\.current = undefined;\n(\s*\/\/.*\n)*\s*if \(fingerDown\.current && !fingerDown\.current\.pressed\) return;\n(\s*\/\/.*\n)*\s*if \(owner\.current !== undefined && reach\.current === REACH\.touch && e\.isTrusted\) \{\n\s*const \{ clientX, clientY \} = e;\n\s*return void requestAnimationFrame\(\(\) => svg\.current\?\.dispatchEvent\(new MouseEvent\("dblclick", \{ clientX, clientY, bubbles: true, cancelable: true, detail: 2 \}\)\)\);\n\s*\}/, "a finger's double-click goes in after its release");
  // A finger's double tap whose press the gate kept from the editor (after a pen, or a palm's) does nothing: each press
  // on the canvas says whether it was a finger's, and the gate's press for that finger marks it pressed.
  assert.match(down, /if \(passOn\.current\) return onPointerDown\(e\);\n\s*fingerDown\.current = e\.pointerType === "touch" \? \{ id: e\.pointerId, pressed: false \} : undefined;/, "each press on the canvas says whether it is a finger's");
  assert.match(editor, /reach\.current = REACH\.touch;\n\s*if \(fingerDown\.current\?\.id === a\.id\) fingerDown\.current\.pressed = true;\n\s*send\("pointerdown", a\.id/, "a finger's press marks it pressed");
  // Chromium sends no dblclick for a second click on an element its press redrew (a resize handle): the canvas sends one
  // after a second release with none, for the mouse and the pen.
  assert.match(editor, /onMouseDown=\{\(e\) => \{ twice\.current = e\.detail === 2 && e\.isTrusted \? "down" : undefined; \}\}\n\s*onMouseUp=\{\(e\) => \{\n\s*if \(twice\.current !== "down" \|\| e\.detail !== 2\) return;\n\s*twice\.current = "up";\n\s*const \{ clientX, clientY \} = e;\n\s*setTimeout\(\(\) => \{ if \(twice\.current === "up"\) svg\.current\?\.dispatchEvent\(new MouseEvent\("dblclick", \{ clientX, clientY, bubbles: true, cancelable: true, detail: 2 \}\)\); \}\);\n\s*\}\}\n\s*onDoubleClick=/, "a second release with no dblclick sends one");
  // Two fingers' sums go from the view they started at; one finger's pan is a step.
  assert.match(editor, /if \(n === undefined\) setView\(\(v\) => \(\{ \.\.\.v, x: v\.x \+ a\.dx, y: v\.y \+ a\.dy \}\)\);\n\s*else zoomWith\(\(v\) => \{\n\s*const r = pinchView\(pinchFrom\.current, v, \{ \.\.\.a, n \}, clampZoom\);/, "two fingers go from the view they started at");
  // Lifting a finger whose hold opened a menu chooses nothing: every right-click menu (ContextMenu) leaves out a
  // finger's click with no press in the menu before it, on its options and on those of an option's own menu.
  const context = menu.slice(menu.indexOf("export function ContextMenu("));
  assert.match(context, /const lift = \(e: React\.MouseEvent\) => \{ if \(\(e\.nativeEvent as PointerEvent\)\.pointerType === "touch" && !pressed\.current\) \{ e\.preventDefault\(\); e\.stopPropagation\(\); \} \};/);
  assert.equal(context.match(/className="context-menu" onKeyDown=\{\(e\) => keys\(e, (false|true)\)\} onContextMenu=\{\(e\) => e\.preventDefault\(\)\} onPointerDownCapture=\{press\} onClickCapture=\{lift\}/g)?.length, 2, "both of a right-click menu's lists");
  // An option with more opens its own menu when the pointer moves onto it, never on a pointerover alone: a menu that
  // opens under the mouse at rest (a long press's) gets one in Chromium.
  assert.match(context, /onClickCapture=\{lift\}\n\s*onPointerMove=\{over\}>/);
  assert.doesNotMatch(context, /onPointerOver/);
}

// ——— Real touch in Chrome (OCTET_STRESS_URL) ———
// What Chromium does around a finger's events (its mouse events and click after a tap, and its click for the lift
// after a hold) cannot be sent from a page. With a dev server, scripts/look/chrome-touch.mjs drives the app in
// headless Chrome over the DevTools protocol, as a touch screen and a pen send their events:
// OCTET_STRESS_URL=http://localhost:1420 node src/touch.check.ts. npm run look -- <url>/?editor touch runs it too.
const stress = process.env.OCTET_STRESS_URL?.replace(/\/$/, "");
if (stress) {
  const run = spawnSync(process.execPath, [fileURLToPath(new URL("../scripts/look/chrome-touch.mjs", import.meta.url)), `${stress}/?editor`], { encoding: "utf8", timeout: 900_000 });
  const out = JSON.parse(run.stdout.trim().split("\n").pop() ?? "{}") as { reached?: string[]; missed?: string[]; errors?: string[] };
  assert.ok(out.reached, `the Chrome checks did not finish:\n${run.stdout}${run.stderr}`);
  assert.deepEqual(out.missed, [], "the Chrome checks");
  assert.deepEqual(out.errors, [], "errors on the page in Chrome");
  console.log(`touch: Chrome passed ${out.reached.length} checks`);
} else console.log("touch: the Chrome checks are off (OCTET_STRESS_URL=<dev server> runs them)");

console.log("touch: ok");
