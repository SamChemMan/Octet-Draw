// The body of an async function that scripts/look/webkit.swift runs in the editor (npm run look -- <url>/?editor
// touch). Pen and touch on the canvas (src/touch.ts, docs/plans/issue-93-pen-touch.md): it sends the canvas pen,
// finger and mouse event sequences, as a tablet's web view sends them, and checks what they draw against what the same
// mouse sequence draws. Then it sets the coarse pointer (data-pointer) and measures the toolbar and the right-click
// menu, light and dark. It returns JSON: the checks that passed (reached), the ones that failed and why (missed), the
// app's own "look:" lines, page errors, and the drawing a fixed mouse session makes (session), to compare with
// another build.
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
const until = async (find, ms = 10000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = find(); if (v) return v; await wait(50); } return null; };
const out = { engine: navigator.userAgent.replace(/^.*\) /, ""), reached: [], missed: [] };
const check = (name, ok, why = "") => (ok ? out.reached.push(name) : out.missed.push(`${name}${why ? `: ${why}` : ""}`));
const key = (init) => { for (const t of [document.activeElement, document.body, window]) t?.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init })); };
const escape = async () => { key({ key: "Escape", code: "Escape" }); await wait(250); };

await until(() => document.querySelector("svg.canvas"));
await wait(1500);
const svg = document.querySelector("svg.canvas");

// ——— Reading the drawing and the view ———
// The drawing as screen readers get it (CanvasAccess): each object's role, name, description and box, without its key
// (keys count up). The Actions panel's options stand for the selection. It settles a moment after an edit.
const drawn = () => [...document.querySelectorAll("[data-object]")].map((e) => [e.getAttribute("aria-roledescription"), e.getAttribute("aria-label"), e.getAttribute("aria-description"), e.style.cssText].join("|")).sort().join("\n");
const state = () => `${drawn()}\nactions: ${document.querySelectorAll(".actions .action").length}${document.querySelector(".caption-box") ? "\nwriting" : ""}`;
const settle = async () => {
  let last = state(), since = Date.now();
  const t0 = Date.now();
  while (Date.now() - t0 < 5000) { await wait(100); const now = state(); if (now !== last) { last = now; since = Date.now(); } else if (Date.now() - since > 700) break; }
  return last;
};
const view = () => {
  const s = document.querySelector(".canvas-access-layer")?.getAttribute("style") ?? "";
  const t = /translate\(([-\d.e]+)px, ([-\d.e]+)px\)/.exec(s), z = /--zoom: ([-\d.e]+)/.exec(s);
  return { x: Number(t?.[1]), y: Number(t?.[2]), zoom: Number(z?.[1]) };
};
const toolOn = () => document.querySelector(".palette .tool[aria-pressed='true']")?.getAttribute("aria-label");
const pick = async (re) => {
  const t = [...document.querySelectorAll(".palette .tool")].find((b) => re.test(b.getAttribute("aria-label") ?? ""));
  if (!t) return false;
  if (t.getAttribute("aria-pressed") !== "true") t.click();
  await wait(250);
  await escape(); // a second click on the tool in hand opens its menu
  return t.getAttribute("aria-pressed") === "true";
};
const clear = async () => {
  await escape();
  key({ key: "a", code: "KeyA", metaKey: true, ctrlKey: !/Mac/.test(navigator.platform) });
  await wait(200);
  key({ key: "Delete", code: "Delete" });
  await wait(200);
  await escape();
  return (await settle()).startsWith("\n");
};
const undo = async () => { key({ key: "z", code: "KeyZ", metaKey: true }); return settle(); };

// ——— Sending events ———
let ids = 20;
const send = (type, x, y, o = {}) => svg.dispatchEvent(new PointerEvent(type, {
  clientX: x, clientY: y, bubbles: true, cancelable: true, pointerId: o.id ?? 1, pointerType: o.type ?? "mouse", isPrimary: o.primary ?? true,
  button: o.button ?? (type === "pointermove" ? -1 : 0), buttons: o.buttons ?? (type === "pointerup" || type === "pointercancel" ? 0 : 1),
  pressure: o.pressure ?? (o.type === "pen" ? 0.4 + Math.random() * 1.3 : 0.5), tiltX: o.tiltX ?? (o.type === "pen" ? 60 : 0), tiltY: o.tiltY ?? 0, twist: o.twist ?? (o.type === "pen" ? 359 : 0), width: o.width ?? 1, height: o.height ?? 1,
}));
const kinds = { mouse: { type: "mouse", id: 1 }, pen: { type: "pen", id: 2 } };
const who = (kind) => (kind === "touch" ? { type: "touch", id: ids++ } : kinds[kind]);
// A drag from a to b in steps, a frame apart, as a hand moves. The mouse and the pen hover to the start first.
async function stroke(kind, a, b, steps = 12) {
  const p = who(kind);
  if (kind !== "touch") { send("pointermove", a[0], a[1], { ...p, buttons: 0 }); await frame(); }
  send("pointerdown", a[0], a[1], p);
  await frame();
  for (let k = 1; k <= steps; k++) { send("pointermove", a[0] + ((b[0] - a[0]) * k) / steps, a[1] + ((b[1] - a[1]) * k) / steps, p); await frame(); }
  send("pointerup", b[0], b[1], p);
  await frame();
  if (kind !== "touch") send("pointermove", b[0] + 300, b[1] + 200, { ...p, buttons: 0 }); // away, so no hover is left
  return settle();
}
// A click. The pen's shakes up to 5 px on the way (a hand on a screen), which is still a click.
async function tap(kind, a) {
  const p = who(kind);
  if (kind !== "touch") { send("pointermove", a[0], a[1], { ...p, buttons: 0 }); await frame(); }
  send("pointerdown", a[0], a[1], p);
  await frame();
  if (kind === "pen") for (const [dx, dy] of [[2, 1], [4, -2], [3, 3]]) { send("pointermove", a[0] + dx, a[1] + dy, p); await frame(); }
  send("pointerup", a[0], a[1], p);
  await frame();
  if (kind !== "touch") send("pointermove", a[0] + 300, a[1] + 200, { ...p, buttons: 0 });
  return settle();
}

// ——— A fixed mouse session (the same on every build: compare session between them) ———
const SESSION = [
  [/bond$/i, (k) => stroke(k, [520, 380], [580, 380])],
  [/bond$/i, (k) => tap(k, [520, 520])],
  [/^Chain$/, (k) => stroke(k, [700, 380], [800, 400])],
  [/^Benzene$/, (k) => tap(k, [900, 380])],
  [/arrow$/, (k) => stroke(k, [520, 650], [640, 650])],
  [/^Box$/, (k) => stroke(k, [700, 600], [780, 680])],
  [/^Select$/, (k) => stroke(k, [480, 340], [620, 420])],
];
{
  await clear();
  for (const [tool, act] of SESSION) { await pick(tool); await act("mouse"); }
  out.session = await settle();
  await clear();
}
// <url>/?editor&look-session: the session alone, for a build without this script's other checks (the base).
if (new URLSearchParams(location.search).has("look-session")) { out.look = window.__look; out.errors = window.__errors.slice(0, 10); return JSON.stringify(out); }

// ——— The page never zooms (job 5, stress 19) ———
// touch-action is not inherited: a pinch zooms the window only where every element from the one touched up to the
// root allows pinch-zoom. The root allows panning only, so nothing under it can zoom the window.
const pinchable = (el) => { for (let a = el; a; a = a.parentElement) { const t = getComputedStyle(a).touchAction; if (t === "none" || (t !== "auto" && t !== "manipulation" && !t.includes("pinch-zoom"))) return false; } return true; };
check("the root lets a finger pan but not zoom the window", getComputedStyle(document.documentElement).touchAction === "pan-x pan-y", getComputedStyle(document.documentElement).touchAction);
check("the canvas takes every touch itself", getComputedStyle(svg).touchAction === "none", getComputedStyle(svg).touchAction);

// ——— One finger acts as the mouse while no pen has been used (job 4) ———
// Each sibling tool: a finger's drag and the same mouse drag give the same drawing. Text: a tap.
const DRAGS = [
  ["Bond", /bond$/i, [560, 420], [640, 440]],
  ["Chain", /^Chain$/, [560, 420], [700, 470]],
  ["Benzene", /^Benzene$/, [560, 420], [600, 420]],
  ["Templates", /Templates$/, [560, 420], [620, 420]],
  ["Reaction arrow", /arrow$/, [560, 420], [700, 420]],
  ["Box", /^Box$/, [560, 420], [660, 500]],
  ["Brackets", /^Brackets$/, [560, 420], [660, 500]],
  ["TLC plate", /^TLC plate$/, [560, 420], [660, 560]],
];
async function sameAsMouse(kind, extra = async () => {}) {
  for (const [name, tool, a, b] of DRAGS) {
    await clear();
    await extra();
    if (!(await pick(tool))) { check(`${kind}: ${name}`, false, "tool not found"); continue; }
    const mouse = await stroke("mouse", a, b);
    await clear();
    await extra();
    await pick(tool);
    const other = await stroke(kind, a, b);
    check(`${kind} drag with ${name} draws as the mouse`, mouse === other && drawn() !== "", `mouse:\n${mouse}\n${kind}:\n${other}`);
  }
  // Select: a box round a structure picks it as the mouse's box does.
  await clear(); await pick(/bond$/i); await stroke("mouse", [600, 420], [660, 420]); await pick(/^Select$/);
  const mouse = await stroke("mouse", [560, 380], [700, 460]);
  await clear(); await pick(/bond$/i); await stroke("mouse", [600, 420], [660, 420]); await pick(/^Select$/);
  const other = await stroke(kind, [560, 380], [700, 460]);
  check(`${kind} box with Select picks as the mouse's`, mouse === other && /actions: [1-9]/.test(mouse), `mouse:\n${mouse}\n${kind}:\n${other}`);
  // Text: a tap places a caption to type in.
  await clear(); await pick(/^Text$/);
  const m = await tap("mouse", [600, 420]);
  await escape(); await clear(); await pick(/^Text$/);
  const t = await tap(kind, [600, 420]);
  check(`${kind} tap with Text places a caption as the mouse's`, m === t && m.includes("writing"), `mouse:\n${m}\n${kind}:\n${t}`);
  await escape();
}
{
  await clear(); await pick(/bond$/i);
  const mouse = await tap("mouse", [600, 420]);
  await clear(); await pick(/bond$/i);
  const finger = await tap("touch", [600, 420]);
  check("a finger tap draws as a mouse click (Bond)", mouse === finger && drawn() !== "", `mouse:\n${mouse}\nfinger:\n${finger}`);
}
await sameAsMouse("touch");

// Two fingers that land 120 ms apart: nothing drawn, the view pans and zooms about them, the point under them stays,
// and the undo list is as it was (job 5, stress 1 and 20).
{
  await clear(); await pick(/bond$/i);
  const before = await stroke("mouse", [400, 300], [460, 300]);
  const v0 = view(), a = who("touch"), b = who("touch");
  send("pointerdown", 560, 450, a);
  await wait(120);
  send("pointerdown", 760, 450, { ...b, primary: false });
  await frame();
  for (let k = 1; k <= 10; k++) { send("pointermove", 560 - 6 * k, 450 + 3 * k, a); send("pointermove", 760 + 6 * k, 450 + 3 * k, { ...b, primary: false }); await frame(); }
  send("pointerup", 500, 480, a); send("pointerup", 820, 480, { ...b, primary: false });
  const after = await settle(), v1 = view();
  // The drawing point under the first midpoint (660, 450) is under the last one (660, 480).
  const dx = (660 - v0.x) / v0.zoom, dy = (450 - v0.y) / v0.zoom, sx = v1.x + dx * v1.zoom, sy = v1.y + dy * v1.zoom;
  check("two fingers draw nothing", after === before, `before:\n${before}\nafter:\n${after}`);
  check("two fingers zoom in as they spread", v1.zoom > v0.zoom * 1.3, `${v0.zoom} to ${v1.zoom}`);
  check("the point under the fingers stays under them", Math.abs(sx - 660) < 1 && Math.abs(sy - 480) < 1, `it is at ${sx.toFixed(2)}, ${sy.toFixed(2)}`);
  const undone = await undo(), v2 = view();
  check("Undo after a pinch takes back the bond, not the zoom", !undone.includes("ethane") && v2.zoom === v1.zoom && v2.x === v1.x, `${undone}; zoom ${v1.zoom} to ${v2.zoom}`);
}
// A second finger after the first has started a bond: no bond, no undo step (job 5, stress 2).
{
  await clear(); await pick(/bond$/i);
  const before = await settle(), a = who("touch"), b = who("touch");
  send("pointerdown", 560, 450, a); await frame();
  for (let k = 1; k <= 8; k++) { send("pointermove", 560 + 8 * k, 450, a); await frame(); }
  await wait(100);
  send("pointerdown", 800, 450, { ...b, primary: false }); await frame();
  for (let k = 1; k <= 5; k++) { send("pointermove", 624 + 4 * k, 450, a); send("pointermove", 800 + 4 * k, 450, { ...b, primary: false }); await frame(); }
  send("pointerup", 644, 450, a); send("pointerup", 820, 450, { ...b, primary: false });
  const after = await settle();
  check("a late second finger stops the first finger's bond", after === before, after);
}
// The same while the first finger moves a selection: it goes back where it was (stress 3).
{
  await clear(); await pick(/bond$/i); await stroke("mouse", [600, 420], [660, 420]); await pick(/^Select$/);
  await stroke("mouse", [560, 380], [700, 460]);
  const before = await settle(), a = who("touch"), b = who("touch");
  send("pointerdown", 630, 420, a); await frame();
  for (let k = 1; k <= 8; k++) { send("pointermove", 630 + 8 * k, 420 + 4 * k, a); await frame(); }
  send("pointerdown", 900, 420, { ...b, primary: false }); await frame();
  send("pointerup", 694, 452, a); send("pointerup", 900, 420, { ...b, primary: false });
  const after = await settle();
  check("a late second finger puts a moved selection back", after === before, `before:\n${before}\nafter:\n${after}`);
}
// Two fingers on a bond with the Eraser: nothing is erased (stress 4).
{
  await clear(); await pick(/bond$/i);
  const before = await stroke("mouse", [600, 420], [660, 420]);
  await pick(/^Eraser/);
  const a = who("touch"), b = who("touch");
  send("pointerdown", 630, 420, a); await wait(50);
  send("pointerdown", 640, 430, { ...b, primary: false }); await frame();
  for (let k = 1; k <= 5; k++) { send("pointermove", 630 - 5 * k, 420, a); send("pointermove", 640 + 5 * k, 430, { ...b, primary: false }); await frame(); }
  send("pointerup", 605, 420, a); send("pointerup", 665, 430, { ...b, primary: false });
  const after = await settle();
  check("two fingers on a bond with the Eraser erase nothing", after === before, after);
}
// A long press opens the Actions menu; lifting chooses nothing, and nothing is drawn (job 6, stress 18).
{
  await clear(); await pick(/bond$/i);
  const before = await settle(), a = who("touch");
  send("pointerdown", 600, 420, a);
  await wait(250);
  const ringShown = !!document.querySelector(".hold-ring");
  await wait(350);
  const open = !!document.querySelector(".context-menu");
  for (let k = 1; k <= 6; k++) { send("pointermove", 600 + 12 * k, 420, a); await frame(); }
  send("pointerup", 672, 420, a);
  await wait(400);
  const still = !!document.querySelector(".context-menu"), after = await settle();
  check("a long press shows the hold ring", ringShown);
  check("a long press opens the Actions menu", open);
  check("lifting after a long press keeps the menu and draws nothing", still && after === before, `menu ${still}; ${after}`);
  await escape();
  // A finger tap while the menu is open closes it, and then does what a mouse click there does (stress 19).
  await clear(); await pick(/bond$/i);
  svg.dispatchEvent(new MouseEvent("contextmenu", { clientX: 600, clientY: 420, bubbles: true, cancelable: true, button: 2 }));
  await wait(400);
  const mouse = await tap("mouse", [900, 600]), mouseShut = !document.querySelector(".context-menu");
  await clear(); await pick(/bond$/i);
  send("pointerdown", 600, 420, a); await wait(600); send("pointerup", 600, 420, a); await wait(300);
  const finger = await tap("touch", [900, 600]), fingerShut = !document.querySelector(".context-menu");
  check("a finger tap away closes the Actions menu as a mouse click does", mouseShut && fingerShut && mouse === finger, `mouse ${mouseShut}:\n${mouse}\nfinger ${fingerShut}:\n${finger}`);
  await escape();
}
// A pointercancel (an edge swipe) during a finger's drag: nothing is drawn (stress 9).
{
  await clear(); await pick(/bond$/i);
  const before = await settle(), a = who("touch");
  send("pointerdown", 560, 450, a); await frame();
  for (let k = 1; k <= 8; k++) { send("pointermove", 560 + 8 * k, 450, a); await frame(); }
  send("pointercancel", 624, 450, a);
  const after = await settle();
  check("a cancelled finger drag draws nothing", after === before, after);
}
// A mouse press during a finger's drag is ignored until the finger lifts (stress 21).
{
  await clear(); await pick(/bond$/i);
  const alone = await stroke("touch", [560, 450], [640, 470]);
  await clear(); await pick(/bond$/i);
  const a = who("touch");
  send("pointerdown", 560, 450, a); await frame();
  for (let k = 1; k <= 6; k++) { send("pointermove", 560 + (80 * k) / 12, 450 + (20 * k) / 12, a); await frame(); }
  send("pointerdown", 900, 300); await frame(); send("pointerup", 900, 300); await frame();
  for (let k = 7; k <= 12; k++) { send("pointermove", 560 + (80 * k) / 12, 450 + (20 * k) / 12, a); await frame(); }
  send("pointerup", 640, 470, a);
  const after = await settle();
  check("a mouse click during a finger's drag is ignored", after === alone, `alone:\n${alone}\nwith a click:\n${after}`);
}

// ——— The pen (jobs 1 to 3), and a palm's press that a pen stops (stress 11) ———
{
  await clear(); await pick(/bond$/i);
  const penAlone = await stroke("mouse", [700, 300], [780, 300]);
  await clear(); await pick(/bond$/i);
  const palm = who("touch");
  send("pointerdown", 560, 500, palm); await frame();
  for (let k = 1; k <= 6; k++) { send("pointermove", 560 + 5 * k, 500, palm); await frame(); }
  const drew = await stroke("pen", [700, 300], [780, 300]);
  send("pointerup", 590, 500, palm);
  const after = await settle();
  check("a pen press stops a palm's press, and the pen draws", after === penAlone && drew === penAlone, `pen alone:\n${penAlone}\nwith a palm:\n${after}`);
}
await sameAsMouse("pen");
{
  await clear(); await pick(/bond$/i);
  const mouse = await tap("mouse", [600, 420]);
  await clear(); await pick(/bond$/i);
  const pen = await tap("pen", [600, 420]);
  check("a pen tap that shakes 5 px is a click (Bond)", mouse === pen && drawn() !== "", `mouse:\n${mouse}\npen:\n${pen}`);
}
// The pen held still: Select takes over, as with the mouse, and no Actions menu opens (job 1).
{
  await clear(); await pick(/bond$/i);
  const p = who("pen");
  send("pointermove", 600, 420, { ...p, buttons: 0 }); await frame();
  send("pointerdown", 600, 420, p);
  for (let k = 0; k < 30; k++) { send("pointermove", 600 + (k % 3), 420 + (k % 2), p); await wait(20); }
  const during = toolOn();
  svg.dispatchEvent(new MouseEvent("contextmenu", { clientX: 600, clientY: 420, bubbles: true, cancelable: true, button: 2 }));
  await frame();
  const menu = !!document.querySelector(".context-menu");
  send("pointerup", 601, 421, p); await wait(200);
  check("a pen held still gives Select, and the Bond tool comes back", during === "Select" && /bond$/i.test(toolOn() ?? ""), `${during}, then ${toolOn()}`);
  check("a pen held still opens no Actions menu", !menu);
  await escape();
}
// The eraser end: a tap removes what is under it as the Eraser's click does, in one undo step, and the Bond tool comes
// back (job 2, stress 13). A rub removes all it crosses.
{
  await clear(); await pick(/bond$/i);
  const drawnBond = await stroke("mouse", [600, 420], [660, 420]);
  await pick(/^Eraser/);
  const eraser = await tap("mouse", [630, 420]);
  await clear(); await pick(/bond$/i);
  await stroke("mouse", [600, 420], [660, 420]);
  const e = { type: "pen", id: 2 };
  send("pointermove", 630, 420, { ...e, buttons: 0 }); await frame();
  send("pointerdown", 630, 420, { ...e, button: 5, buttons: 32 }); await frame(); await frame();
  send("pointerup", 630, 420, { ...e, button: 5, buttons: 0 });
  const erased = await settle();
  check("the eraser end erases as the Eraser does", erased === eraser && erased !== drawnBond, `Eraser:\n${eraser}\neraser end:\n${erased}`);
  check("the Bond tool is in hand after the eraser end", /bond$/i.test(toolOn() ?? ""), toolOn());
  const back = await undo();
  check("one Undo brings back what the eraser end took", back === drawnBond, back);
  // A rub across two bonds removes both, in one undo step.
  await clear(); await pick(/bond$/i);
  await stroke("mouse", [600, 380], [600, 440]); await stroke("mouse", [700, 380], [700, 440]);
  const two = await settle();
  send("pointerdown", 560, 410, { ...e, button: 5, buttons: 32 }); await frame(); await frame();
  for (let k = 1; k <= 16; k++) { send("pointermove", 560 + 12 * k, 410, { ...e, buttons: 32 }); await frame(); }
  send("pointerup", 752, 410, { ...e, button: 5, buttons: 0 });
  const rubbed = await settle();
  check("the eraser end rubbed over two bonds erases both", rubbed.trim().startsWith("actions") || !rubbed.includes("ethane"), rubbed);
  check("one Undo brings both back", (await undo()) === two);
  // On a selected structure's resize handle and rotation handle it erases, never scales or turns (stress 13).
  await clear(); await pick(/bond$/i); await stroke("mouse", [600, 420], [660, 420]);
  key({ key: "a", code: "KeyA", metaKey: true }); await wait(300);
  const box = document.querySelector("[data-object]")?.getBoundingClientRect();
  if (box) {
    send("pointerdown", box.right, box.bottom, { ...e, button: 5, buttons: 32 }); await frame(); await frame();
    for (let k = 1; k <= 6; k++) { send("pointermove", box.right + 10 * k, box.bottom + 10 * k, { ...e, buttons: 32 }); await frame(); }
    send("pointerup", box.right + 60, box.bottom + 60, { ...e, button: 5, buttons: 0 });
    const s = await settle();
    check("the eraser end on a resize handle does not scale", !s.includes("--w: 38") && /bond$/i.test(toolOn() ?? ""), s);
  } else check("the eraser end on a resize handle does not scale", false, "no structure box");
}
// The side button opens the Actions menu once: with the browser's own menu event after it, and with none (job 3, 15).
{
  await clear(); await pick(/bond$/i); await stroke("mouse", [600, 420], [660, 420]);
  let opened = 0;
  const watch = new MutationObserver((list) => { for (const m of list) for (const n of m.addedNodes) if (n.nodeType === 1 && (n.matches(".context-menu") || n.querySelector?.(".context-menu"))) opened++; });
  watch.observe(document.body, { childList: true, subtree: true });
  const p = { type: "pen", id: 2 };
  for (const withEvent of [true, false]) {
    opened = 0;
    send("pointermove", 630, 420, { ...p, buttons: 0 }); await frame();
    send("pointerdown", 630, 420, { ...p, button: 2, buttons: 2 }); await frame();
    send("pointerup", 630, 420, { ...p, button: 2, buttons: 0 });
    if (withEvent) svg.dispatchEvent(new MouseEvent("contextmenu", { clientX: 630, clientY: 420, bubbles: true, cancelable: true, button: 2 }));
    await wait(400);
    check(`the side button opens one Actions menu (${withEvent ? "with" : "without"} the browser's menu event)`, opened === 1 && !!document.querySelector(".context-menu"), `${opened} menus`);
    await escape(); await wait(300);
  }
  watch.disconnect();
}
// A pointercancel during a pen's drag (the pen taken by the system): nothing is drawn (stress 9).
{
  await clear(); await pick(/bond$/i);
  const before = await settle(), p = { type: "pen", id: 2 };
  send("pointerdown", 560, 450, p); await frame();
  for (let k = 1; k <= 8; k++) { send("pointermove", 560 + 8 * k, 450, p); await frame(); }
  send("pointercancel", 624, 450, p);
  const after = await settle();
  check("a cancelled pen drag draws nothing", after === before, after);
}

// ——— Palm rejection (job 7, stress 12) ———
{
  await clear(); await pick(/bond$/i);
  const before = await settle();
  send("pointermove", 800, 300, { type: "pen", id: 2, buttons: 0 });
  await wait(100);
  await tap("touch", [600, 420]);
  const a = who("touch");
  send("pointerdown", 600, 420, a); await wait(600); send("pointerup", 600, 420, a);
  const after = await settle();
  check("a palm right after the pen hovers draws nothing and opens no menu", after === before && !document.querySelector(".context-menu"), after);
  await wait(600);
  const v0 = view(), f = who("touch");
  send("pointerdown", 600, 420, f); await frame();
  for (let k = 1; k <= 10; k++) { send("pointermove", 600 + 8 * k, 420 + 4 * k, f); await frame(); }
  send("pointerup", 680, 460, f);
  const panned = await settle(), v1 = view();
  check("after a pen, one finger moves the view and draws nothing", panned === before && Math.abs(v1.x - v0.x - 80) < 0.5 && Math.abs(v1.y - v0.y - 40) < 0.5, `${v0.x},${v0.y} to ${v1.x},${v1.y}`);
}

// ——— Coarse targets (job 9, stress 18), and no pinch zooms the window from a menu or a panel (stress 19) ———
const px = (el) => el?.getBoundingClientRect();
const coarseLooks = async (theme) => {
  const root = document.documentElement;
  root.dataset.theme = theme;
  await pick(/bond$/i);
  const tools = [...document.querySelectorAll(".palette .tool")];
  check(`coarse ${theme}: every tool is 44 px`, tools.length > 5 && tools.every((t) => t.offsetHeight === 44 && t.offsetWidth === 44), tools.map((t) => `${t.offsetWidth}x${t.offsetHeight}`).join(" "));
  await wait(400);
  const on = document.querySelector(".palette .tool[aria-pressed='true']"), mark = document.querySelector(".palette .indicator");
  const same = (a, b) => a && b && Math.abs(a.left - b.left) < 0.5 && Math.abs(a.top - b.top) < 0.5 && Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5;
  check(`coarse ${theme}: the active mark is on the active tool`, same(px(on), px(mark)), JSON.stringify([px(on), px(mark)]));
  // The tool's own menu (a second click on the tool in hand).
  on?.click(); await wait(500);
  const cells = [...document.querySelectorAll(".palette .strip:not(.list) .variant")].filter((v) => v.offsetHeight);
  check(`coarse ${theme}: the options in the tool's menu are 44 px`, cells.length > 2 && cells.every((v) => v.offsetHeight === 44), cells.map((v) => v.offsetHeight).join(" "));
  check(`a pinch on the toolbar or its menu does not zoom the window (${theme})`, !!cells[0] && !pinchable(cells[0]) && !pinchable(on));
  await escape();
  // Two columns: the mark still sits on the tool in hand.
  document.querySelector(".palette-toggle")?.click(); await wait(700);
  check(`coarse ${theme}: two columns, the active mark is on the active tool`, same(px(document.querySelector(".palette .tool[aria-pressed='true']")), px(mark)));
  document.querySelector(".palette-toggle")?.click(); await wait(700);
  // The Actions menu: 44 px rows, and in the window. Its sub-menu (an option with more) too.
  svg.dispatchEvent(new MouseEvent("contextmenu", { clientX: 630, clientY: 700, bubbles: true, cancelable: true, button: 2 }));
  await wait(500);
  const rows = [...document.querySelectorAll(".context-menu .variant")].filter((v) => v.offsetHeight), menu = px(document.querySelector(".context-menu .strip"));
  check(`coarse ${theme}: the Actions menu's rows are 44 px`, rows.length > 1 && rows.every((v) => v.offsetHeight === 44), rows.map((v) => v.offsetHeight).join(" "));
  check(`coarse ${theme}: the Actions menu is in the window`, !!menu && menu.bottom <= innerHeight - 8 + 0.5 && menu.top >= 8 - 0.5, JSON.stringify(menu));
  check(`a pinch on the Actions menu does not zoom the window (${theme})`, !!rows[0] && !pinchable(rows[0]));
  const more = document.querySelector('.context-menu .variant[aria-haspopup="menu"]');
  more?.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
  await wait(500);
  const menus = [...document.querySelectorAll(".context-menu")], subRows = menus.length > 1 ? [...menus[1].querySelectorAll(".variant")].filter((v) => v.offsetHeight) : [], sub = px(menus[1]?.querySelector(".strip"));
  check(`coarse ${theme}: the Actions menu's sub-menu rows are 44 px and in the window`, !!more && subRows.length > 1 && subRows.every((v) => v.offsetHeight === 44) && !!sub && sub.bottom <= innerHeight - 8 + 0.5 && sub.top >= 8 - 0.5 && sub.right <= innerWidth,
    `${more?.textContent}: ${subRows.map((v) => v.offsetHeight).join(" ")} ${JSON.stringify(sub)}`);
  await escape(); await escape();
  // A list from a button in the Actions panel (Pick).
  const button = [...document.querySelectorAll('.actions button[aria-haspopup="menu"]')].find((b) => b.offsetHeight);
  button?.click(); await wait(500);
  const list = document.querySelector("body > div > .strip.list"), items = list ? [...list.querySelectorAll(".variant")].filter((v) => v.offsetHeight) : [], box = px(list);
  check(`coarse ${theme}: a list menu's options are 44 px and in the window`, items.length > 1 && items.every((v) => v.offsetHeight === 44) && !!box && box.bottom <= innerHeight - 8 + 0.5 && box.top >= 8 - 0.5,
    `${button?.getAttribute("aria-label")}: ${items.map((v) => v.offsetHeight).join(" ")} ${JSON.stringify(box)}`);
  check(`a pinch on a list menu or the Actions panel does not zoom the window (${theme})`, !!items[0] && !pinchable(items[0]) && !!button && !pinchable(button));
  await escape();
  if (document.querySelector(".strip.list:not(.leaving)")) button?.click();
  await wait(300);
  window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
  await wait(1300);
};
{
  await clear(); await pick(/bond$/i); await stroke("mouse", [600, 420], [660, 420]); await stroke("mouse", [600, 520], [660, 520]);
  key({ key: "a", code: "KeyA", metaKey: true }); await wait(300);
  document.documentElement.dataset.pointer = "coarse";
  await wait(300);
  await coarseLooks("light");
  await coarseLooks("dark");
  delete document.documentElement.dataset.theme;
  document.documentElement.dataset.pointer = "fine";
  await wait(300);
  const tools = [...document.querySelectorAll(".palette .tool")];
  check("fine again: every tool is 32 px", tools.every((t) => t.offsetHeight === 32), tools.map((t) => t.offsetHeight).join(" "));
  svg.dispatchEvent(new MouseEvent("contextmenu", { clientX: 630, clientY: 700, bubbles: true, cancelable: true, button: 2 }));
  await wait(500);
  const rows = [...document.querySelectorAll(".context-menu .variant")].filter((v) => v.offsetHeight);
  check("fine again: the Actions menu's rows are 30 px", rows.length > 1 && rows.every((v) => v.offsetHeight === 30), rows.map((v) => v.offsetHeight).join(" "));
  await escape();
}

out.look = window.__look;
out.errors = window.__errors.slice(0, 10);
return JSON.stringify(out);
