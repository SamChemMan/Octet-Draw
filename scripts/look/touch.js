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
// <url>/?editor&look-only=pen,coarse runs those parts alone (the names given to part below). out is on window, so a
// run that reaches its time limit still reports what it passed (webkit.swift).
const only = new URLSearchParams(location.search).get("look-only")?.split(","), started = Date.now();
const part = (name) => { const on = !only || only.includes(name); if (on) (out.parts ??= []).push(`${name} at ${Math.round((Date.now() - started) / 1000)} s`); return on; };
window.__partial = out;
// A key press where the focus is: it bubbles up to the window, so each key goes in once (⌘Z is one Undo).
const key = (init) => (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));
const escape = async () => { key({ key: "Escape", code: "Escape" }); await wait(250); };

await until(() => document.querySelector("svg.canvas"));
await wait(1500);
const svg = document.querySelector("svg.canvas");

// ——— Reading the drawing and the view ———
// The drawing as screen readers get it (CanvasAccess): each object's role, name, description and box, without its key
// (keys count up). The Actions panel's options stand for the selection. It settles a moment after an edit.
const drawn = () => [...document.querySelectorAll("[data-object]")].map((e) => [e.getAttribute("aria-roledescription"), e.getAttribute("aria-label"), e.getAttribute("aria-description"), e.style.cssText].join("|")).sort().join("\n");
const state = () => `${drawn()}\nactions: ${document.querySelectorAll(".actions .action").length}${document.querySelector(".caption-box") ? "\nwriting" : ""}${document.activeElement?.matches?.("input, textarea, [contenteditable='true']") ? `\ntyping in ${document.activeElement.getAttribute("aria-label") ?? document.activeElement.className}` : ""}`;
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
// After each pointerup the canvas gets lostpointercapture too, as a browser sends it when a pointer it captured lifts.
const send = (type, x, y, o = {}) => {
  const at = (t) => svg.dispatchEvent(new PointerEvent(t, {
    clientX: x, clientY: y, bubbles: true, cancelable: true, pointerId: o.id ?? 1, pointerType: o.type ?? "mouse", isPrimary: o.primary ?? true,
    button: o.button ?? (t === "pointermove" ? -1 : 0), buttons: o.buttons ?? (t === "pointerup" || t === "pointercancel" || t === "lostpointercapture" ? 0 : 1),
    pressure: o.pressure ?? (o.type === "pen" ? 0.4 + Math.random() * 1.3 : 0.5), tiltX: o.tiltX ?? (o.type === "pen" ? 60 : 0), tiltY: o.tiltY ?? 0, twist: o.twist ?? (o.type === "pen" ? 359 : 0), width: o.width ?? 1, height: o.height ?? 1,
  }));
  const done = at(type);
  if (type === "pointerup") at("lostpointercapture");
  return done;
};
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
  if (kind === "touch") send("pointerout", b[0], b[1], { ...p, buttons: 0 }); // a finger leaves as it lifts, as a web view sends it
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
  if (kind === "touch") send("pointerout", a[0], a[1], { ...p, buttons: 0 }); // a finger leaves as it lifts, as a web view sends it
  await frame();
  if (kind !== "touch") send("pointermove", a[0] + 300, a[1] + 200, { ...p, buttons: 0 });
  return settle();
}
// A drag through points (a lasso), a frame apart.
async function strokePath(kind, points) {
  const p = who(kind), [a] = points, b = points[points.length - 1];
  if (kind !== "touch") { send("pointermove", a[0], a[1], { ...p, buttons: 0 }); await frame(); }
  send("pointerdown", a[0], a[1], p);
  await frame();
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1], [x1, y1] = points[i];
    for (let k = 1; k <= 6; k++) { send("pointermove", x0 + ((x1 - x0) * k) / 6, y0 + ((y1 - y0) * k) / 6, p); await frame(); }
  }
  send("pointerup", b[0], b[1], p);
  if (kind === "touch") send("pointerout", b[0], b[1], { ...p, buttons: 0 }); // a finger leaves as it lifts, as a web view sends it
  await frame();
  if (kind !== "touch") send("pointermove", b[0] + 300, b[1] + 200, { ...p, buttons: 0 });
  return settle();
}
// The toolbar's tools in order: 0 Select, 1 Bond, 2 Chain, 3 Ring, 4 Template, 5 Sequence, 6 Orbital, 7 Symbol,
// 8 Arrow, 9 Cycle, 10 Shape, 11 Brackets, 12 Pen, 13 Measure (the section between two lines), 14 Text, 15 Eraser,
// 16 the specialist tool.
const slotTool = (i) => document.querySelectorAll(".palette .slot > button.tool")[i];
const pickSlot = async (i) => {
  const t = slotTool(i);
  if (!t) return false;
  if (t.getAttribute("aria-pressed") !== "true") t.click();
  await wait(250);
  await escape();
  return slotTool(i)?.getAttribute("aria-pressed") === "true";
};
// The tool in slot i with the option key from its menu (data-item). It gives the option that was chosen before.
async function option(i, key) {
  if (!(await pickSlot(i))) return undefined;
  slotTool(i).click();
  await wait(400);
  let options = [...document.querySelectorAll(".palette .strip:not(.leaving) .variant")];
  // A menu that did not open in time (the last one still closing): once more.
  if (!options.length) { await escape(); slotTool(i).click(); await wait(600); options = [...document.querySelectorAll(".palette .strip:not(.leaving) .variant")]; }
  const was = options.find((b) => b.getAttribute("aria-checked") === "true")?.dataset.item, v = options.find((b) => b.dataset.item === key);
  v?.click();
  await wait(350);
  if (document.querySelector(".palette .strip:not(.leaving)")) await escape();
  return v && slotTool(i)?.getAttribute("aria-pressed") === "true" ? was ?? key : undefined;
}

// Whether a pinch on an element zooms the window. touch-action is not inherited: a pinch zooms the window only where
// every element from the one touched up to the root allows pinch-zoom. The root allows panning only, so nothing under
// it can zoom the window.
const pinchable = (el) => { for (let a = el; a; a = a.parentElement) { const t = getComputedStyle(a).touchAction; if (t === "none" || (t !== "auto" && t !== "manipulation" && !t.includes("pinch-zoom"))) return false; } return true; };

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
  // The options a new user has, which the checks find their tools by: the web view keeps the settings, and a run
  // stopped part way leaves the options its sibling checks chose.
  for (const [slot, key] of [[0, "box"], [10, "box-plain"], [12, "pen"], [13, "distance"], [16, "tlc"]]) await option(slot, key);
  await clear();
  for (const [tool, act] of SESSION) { await pick(tool); await act("mouse"); }
  out.session = await settle();
  await clear();
}
// <url>/?editor&look-session: the session alone, for a build without this script's other checks (the base).
if (new URLSearchParams(location.search).has("look-session")) { out.look = window.__look; out.errors = window.__errors.slice(0, 10); return JSON.stringify(out); }
if (new URLSearchParams(location.search).has("look-coarse")) { await clear(); await coarseSection(); out.look = window.__look; out.errors = window.__errors.slice(0, 10); return JSON.stringify(out); }

// ——— The page never zooms (job 5, stress 19) ———
if (part("root")) {
  check("the root lets a finger pan but not zoom the window", getComputedStyle(document.documentElement).touchAction === "pan-x pan-y", getComputedStyle(document.documentElement).touchAction);
  check("the canvas takes every touch itself", getComputedStyle(svg).touchAction === "none", getComputedStyle(svg).touchAction);
}

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
// The other tools, each with its option chosen from its menu: [name, slot, option, tap or drag, from, to, a bond first].
// A bond first: the tool works on a structure (the Eraser, the cut tools, the atom map, a symbol on an atom). Points
// given as functions are found from that bond's box on screen (r), so the stroke crosses it at any zoom. marks: what the
// tool does shows on the canvas but not to screen readers (an unfinished Pen curve, a map number), so the canvas's
// marks count too.
const across = [(r) => [(r.left + r.right) / 2, (r.top + r.bottom) / 2 - 40], (r) => [(r.left + r.right) / 2, (r.top + r.bottom) / 2 + 40]];
const SIBLINGS = [
  ["Orbital", 6, undefined, "drag", [560, 420], [620, 420]],
  ["Symbol", 7, undefined, "tap", [600, 420], undefined, true],
  ["Peptide", 5, undefined, "tap", [600, 420]],
  ["Catalytic cycle", 9, "circle", "drag", [560, 420], [680, 420]],
  ["Pen curve", 12, "pen", "drag", [560, 420], [620, 450], false, true],
  ["Measure length", 13, "distance", "drag", [560, 420], [660, 470]],
  ["Eraser", 15, undefined, "drag", ...across, true],
  ["Gel", 16, "gel", "drag", [560, 420], [660, 560]],
  ["Plasmid map", 16, "plasmid", "drag", [560, 420], [660, 520]],
  ["Table", 16, "table", "drag", [560, 420], [700, 520]],
  ["Mass fragmentation", 16, "fragment", "drag", ...across, true],
  ["Mass spec analysis", 16, "massspec", "drag", ...across, true],
  ["Synthesis", 16, "synthesis", "drag", ...across, true],
  ["Retrosynthesis", 16, "retro", "drag", ...across, true],
  ["Atom map", 16, "map", "drag", (r) => [r.left, (r.top + r.bottom) / 2], (r) => [r.right, (r.top + r.bottom) / 2], true, true],
];
const canvasMarks = () => `\nmarks: ${svg.querySelectorAll("path, line, polyline, polygon, circle, ellipse, rect, text").length}`;
const bondFirst = async () => { await pick(/bond$/i); await stroke("mouse", [600, 420], [660, 420]); };
async function sameAsMouse(kind, extra = async () => {}) {
  if (part(`${kind}-drags`)) for (const [name, tool, a, b] of DRAGS) {
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
  if (part(`${kind}-siblings`)) {
  const back = {};
  // Lasso: round a bond, as the mouse's lasso. First: once Mass spec analysis has opened its panel, the Actions panel
  // (which the check reads) is hidden.
  const ring = [[570, 390], [690, 390], [690, 450], [570, 450], [572, 396]];
  await clear(); await bondFirst(); const lasso = await option(0, "lasso");
  back[0] ??= lasso;
  const lassoMouse = await strokePath("mouse", ring);
  await clear(); await bondFirst(); await option(0, "lasso");
  const lassoOther = await strokePath(kind, ring);
  check(`${kind} lasso with Select picks as the mouse's`, !!lasso && lassoMouse === lassoOther && /actions: [1-9]/.test(lassoMouse), `${lasso ? "" : "Lasso not chosen\n"}mouse:\n${lassoMouse}\n${kind}:\n${lassoOther}`);
  for (const [name, slot, key, how, a, b, bond, marks] of SIBLINGS) {
    const run = async (who) => {
      await clear();
      await extra();
      if (bond) await bondFirst();
      const r = document.querySelector("[data-object]")?.getBoundingClientRect(), at = (q) => (typeof q === "function" ? q(r) : q);
      const was = key ? await option(slot, key) : await pickSlot(slot);
      if (!was) return undefined;
      if (key && !(slot in back)) back[slot] = was;
      const before = (await settle()) + (marks ? canvasMarks() : "");
      const after = await (how === "tap" ? tap(who, at(a)) : stroke(who, at(a), at(b)));
      return [before, after + (marks ? canvasMarks() : "")];
    };
    const mouse = await run("mouse");
    if (mouse === undefined) { check(`${kind} with ${name} draws as the mouse`, false, "tool not found"); continue; }
    await escape();
    const other = await run(kind);
    // The mouse's stroke changed something, and the other pointer's changed it the same way.
    check(`${kind} ${how} with ${name} draws as the mouse`, !!other && mouse[1] !== mouse[0] && mouse[1] === other[1], `mouse:\n${mouse[1]}\n${kind}:\n${other?.[1]}`);
    await escape();
  }
  // The options as they were, so the other checks find their tools by name.
  for (const [slot, key] of Object.entries(back)) await option(Number(slot), key);
  await clear();
  }
  if (!part(`${kind}-drags`)) return;
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
if (part("touch-drags")) {
  await clear(); await pick(/bond$/i);
  const mouse = await tap("mouse", [600, 420]);
  await clear(); await pick(/bond$/i);
  const finger = await tap("touch", [600, 420]);
  check("a finger tap draws as a mouse click (Bond)", mouse === finger && drawn() !== "", `mouse:\n${mouse}\nfinger:\n${finger}`);
}
await sameAsMouse("touch");

// Two fingers that land 120 ms apart: nothing drawn, the view pans and zooms about them, the point under them stays,
// and the undo list is as it was (job 5, stress 1).
if (part("pinch")) {
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
if (part("late")) {
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
// The same while the first finger moves a selection: it goes back where it was (stress 2).
if (part("late")) {
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
// Two fingers on a bond with the Eraser: nothing is erased (stress 3).
if (part("late")) {
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
// A long press opens the Actions menu; lifting chooses nothing, and nothing is drawn (job 6, stress 12).
if (part("hold")) {
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
  // A finger tap while the menu is open closes it, and then does what a mouse click there does (stress 12).
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
// A pointercancel (an edge swipe) during a finger's drag: nothing is drawn (stress 6).
if (part("cancel")) {
  await clear(); await pick(/bond$/i);
  const before = await settle(), a = who("touch");
  send("pointerdown", 560, 450, a); await frame();
  for (let k = 1; k <= 8; k++) { send("pointermove", 560 + 8 * k, 450, a); await frame(); }
  send("pointercancel", 624, 450, a);
  const after = await settle();
  check("a cancelled finger drag draws nothing", after === before, after);
}
// A mouse press during a finger's drag is ignored until the finger lifts (stress 7).
if (part("cancel")) {
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

// ——— The pen (jobs 1 to 3), and a palm's press that a pen stops (stress 7) ———
if (part("pen")) {
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
if (part("pen")) {
  await clear(); await pick(/bond$/i);
  const mouse = await tap("mouse", [600, 420]);
  await clear(); await pick(/bond$/i);
  const pen = await tap("pen", [600, 420]);
  check("a pen tap that shakes 5 px is a click (Bond)", mouse === pen && drawn() !== "", `mouse:\n${mouse}\npen:\n${pen}`);
}
// The pen held still: Select takes over, as with the mouse, and no Actions menu opens (job 1).
if (part("pen")) {
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
// back (job 2, stress 8). A rub removes all it crosses.
if (part("eraser")) {
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
  // A quick tap: the eraser end lifts in the frame it pressed, before its press goes in.
  await clear(); await pick(/bond$/i);
  await stroke("mouse", [600, 420], [660, 420]);
  send("pointermove", 630, 420, { ...e, buttons: 0 }); await frame();
  send("pointerdown", 630, 420, { ...e, button: 5, buttons: 32 });
  send("pointerup", 630, 420, { ...e, button: 5, buttons: 0 });
  const quick = await settle();
  check("a quick tap of the eraser end erases as the Eraser does", quick === eraser, `Eraser:\n${eraser}\nquick tap:\n${quick}`);
  // A rub across two bonds removes both, in one undo step.
  await clear(); await pick(/bond$/i);
  await stroke("mouse", [600, 380], [600, 440]); await stroke("mouse", [700, 380], [700, 440]);
  const two = await settle(), first = document.querySelector("[data-object]").getBoundingClientRect(), y = (first.top + first.bottom) / 2; // across both bonds' middles
  send("pointerdown", 560, y, { ...e, button: 5, buttons: 32 }); await frame(); await frame();
  for (let k = 1; k <= 16; k++) { send("pointermove", 560 + 12 * k, y, { ...e, buttons: 32 }); await frame(); }
  send("pointerup", 752, y, { ...e, button: 5, buttons: 0 });
  const rubbed = await settle();
  check("the eraser end rubbed over two bonds erases both", rubbed.trim().startsWith("actions") || !rubbed.includes("ethane"), rubbed);
  const both = await undo();
  check("one Undo brings both back", both === two, `before:\n${two}\nafter Undo:\n${both}`);
  // On a selected structure's resize handle it erases, never scales (stress 8).
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
// The side button on an atom opens the Actions menu once: with the browser's own menu event after it, and with none
// (job 3, stress 9).
if (part("pen")) {
  await clear(); await pick(/bond$/i); await stroke("mouse", [600, 420], [660, 420]);
  let opened = 0;
  const watch = new MutationObserver((list) => { for (const m of list) for (const n of m.addedNodes) if (n.nodeType === 1 && (n.matches(".context-menu") || n.querySelector?.(".context-menu"))) opened++; });
  watch.observe(document.body, { childList: true, subtree: true });
  const p = { type: "pen", id: 2 };
  for (const withEvent of [true, false]) {
    opened = 0;
    send("pointermove", 600, 420, { ...p, buttons: 0 }); await frame();
    send("pointerdown", 600, 420, { ...p, button: 2, buttons: 2 }); await frame();
    send("pointerup", 600, 420, { ...p, button: 2, buttons: 0 });
    if (withEvent) svg.dispatchEvent(new MouseEvent("contextmenu", { clientX: 600, clientY: 420, bubbles: true, cancelable: true, button: 2 }));
    await wait(400);
    check(`the side button opens one Actions menu (${withEvent ? "with" : "without"} the browser's menu event)`, opened === 1 && !!document.querySelector(".context-menu"), `${opened} menus`);
    await escape(); await wait(300);
  }
  watch.disconnect();
}
// A pointercancel during a pen's drag (the pen taken by the system): nothing is drawn (stress 6).
if (part("cancel")) {
  await clear(); await pick(/bond$/i);
  const before = await settle(), p = { type: "pen", id: 2 };
  send("pointerdown", 560, 450, p); await frame();
  for (let k = 1; k <= 8; k++) { send("pointermove", 560 + 8 * k, 450, p); await frame(); }
  send("pointercancel", 624, 450, p);
  const after = await settle();
  check("a cancelled pen drag draws nothing", after === before, after);
}

// ——— More stress cases ———
// The eraser end while a caption is typed: what is under it goes, and the Text tool comes back. On the rotation
// handle: nothing turns (stress 8).
if (part("eraser")) {
  const e = { type: "pen", id: 2 };
  await clear(); await bondFirst(); await pick(/^Text$/);
  await tap("mouse", [800, 300]);
  const typing = (await settle()).includes("writing");
  send("pointermove", 630, 420, { ...e, buttons: 0 }); await frame();
  send("pointerdown", 630, 420, { ...e, button: 5, buttons: 32 }); await frame(); await frame();
  send("pointerup", 630, 420, { ...e, button: 5, buttons: 0 });
  const s = await settle();
  check("the eraser end while a caption is typed erases what is under it, and the Text tool comes back", typing && !s.includes("ethane") && toolOn() === "Text", `${typing}; ${toolOn()}:\n${s}`);
  await escape();
  await clear(); await bondFirst();
  key({ key: "a", code: "KeyA", metaKey: true }); await wait(400);
  const before = drawn(), h = document.querySelector(".turn-handle")?.getBoundingClientRect();
  if (h) {
    const [x, y] = [h.left + h.width / 2, h.top + h.height / 2];
    send("pointermove", x, y, { ...e, buttons: 0 }); await frame();
    send("pointerdown", x, y, { ...e, button: 5, buttons: 32 }); await frame(); await frame();
    for (let k = 1; k <= 8; k++) { send("pointermove", x - 6 * k, y + 8 * k, { ...e, buttons: 32 }); await frame(); }
    send("pointerup", x - 48, y + 64, { ...e, button: 5, buttons: 0 });
    await settle();
    check("the eraser end on the rotation handle turns nothing", drawn() === before && /bond$/i.test(toolOn() ?? ""), `before:\n${before}\nafter:\n${drawn()}`);
  } else check("the eraser end on the rotation handle turns nothing", false, "no rotation handle");
  await escape();
}
// Ten finger taps a second with Bond, each in a new place: one bond each, as ten mouse clicks. A finger tap on an atom
// with Chain opens Add Chain, as a mouse click does. A pen's double tap on an atom with Select does what the mouse's double-click
// does (stress 11).
if (part("taps")) {
  const taps = async (kind) => {
    await clear(); await pick(/bond$/i);
    for (let k = 0; k < 10; k++) {
      const p = who(kind), x = 360 + 60 * k;
      if (kind !== "touch") send("pointermove", x, 600, { ...p, buttons: 0 });
      send("pointerdown", x, 600, p); await wait(40);
      send("pointerup", x, 600, p); await wait(60);
    }
    if (kind !== "touch") send("pointermove", 900, 700, { ...who(kind), buttons: 0 });
    return settle();
  };
  const mouse = await taps("mouse"), finger = await taps("touch");
  check("ten finger taps a second with Bond draw as ten mouse clicks", mouse === finger && (mouse.match(/ethane/g) ?? []).length === 10, `mouse:\n${mouse}\nfinger:\n${finger}`);
  const chain = async (kind) => {
    await clear(); await bondFirst(); await pick(/^Chain$/);
    const s = await tap(kind, [600, 420]), open = !!document.querySelector('[aria-label="Number of atoms"]');
    await escape();
    return `${s}\n${open}`;
  };
  const mc = await chain("mouse"), fc = await chain("touch");
  check("a finger tap on an atom with Chain opens Add Chain, as a mouse click does", mc === fc && mc.endsWith("true"), `mouse:\n${mc}\nfinger:\n${fc}`);
  const double = async (kind) => {
    await clear(); await bondFirst(); await pick(/^Select$/); await escape();
    const p = who(kind);
    send("pointermove", 600, 420, { ...p, buttons: 0 }); await frame();
    for (let k = 0; k < 2; k++) { send("pointerdown", 600, 420, p); await frame(); send("pointerup", 600, 420, p); await frame(); }
    svg.dispatchEvent(new MouseEvent("dblclick", { clientX: 600, clientY: 420, bubbles: true, cancelable: true, detail: 2 }));
    return settle();
  };
  const m2 = await double("mouse"), p2 = await double("pen");
  check("a pen's double tap on an atom with Select does what a mouse double-click does", m2 === p2 && /actions: [1-9]/.test(m2), `mouse:\n${m2}\npen:\n${p2}`);
  await escape();
}
// Five bonds by finger with a pinch after each, then ⌘Z five times and ⌘⇧Z five times: the bonds go and come back,
// and the zoom stays (stress 13).
if (part("undo")) {
  await clear(); await pick(/bond$/i);
  const steps = [];
  for (let k = 0; k < 5; k++) {
    await stroke("touch", [380 + 110 * k, 300], [430 + 110 * k, 300]);
    steps.push(drawn());
    const a = who("touch"), b = who("touch");
    send("pointerdown", 560, 640, a); await wait(40);
    send("pointerdown", 760, 640, { ...b, primary: false }); await frame();
    for (let j = 1; j <= 5; j++) { send("pointermove", 560 - 3 * j, 640, a); send("pointermove", 760 + 3 * j, 640, { ...b, primary: false }); await frame(); }
    send("pointerup", 545, 640, a); send("pointerup", 775, 640, { ...b, primary: false });
    await wait(250);
  }
  const v = view(), undone = [];
  for (let k = 0; k < 5; k++) { await undo(); undone.push(drawn()); }
  const zoomKept = view().zoom === v.zoom;
  const redone = [];
  for (let k = 0; k < 5; k++) { key({ key: "z", code: "KeyZ", metaKey: true, shiftKey: true }); await settle(); redone.push(drawn()); }
  const want = [steps[3], steps[2], steps[1], steps[0], ""];
  check("five Undos take back the five finger bonds, one each, and not the zoom", new Set(steps).size === 5 && undone.every((d, i) => d === want[i]) && zoomKept, `${undone.map((d) => d.split("\n").length).join(" ")}; zoom ${v.zoom} to ${view().zoom}`);
  check("five Redos bring them back", redone.every((d, i) => d === steps[i]) && view().zoom === v.zoom, redone.map((d) => d.split("\n").length).join(" "));
}
// A finger's or a pen's reach: a tap a little off a bond's middle, past the mouse's reach and within the finger's,
// hits the bond as a mouse click on it does; the same mouse click misses it (stress 14). At a low zoom, a finger tap
// in the middle of a ring hits nothing, as the mouse's click there.
if (part("reach")) {
  const off = async (kind, d) => {
    await clear(); await bondFirst();
    const r = document.querySelector("[data-object]").getBoundingClientRect();
    return [await tap(kind, [(r.left + r.right) / 2, (r.top + r.bottom) / 2 + d]), r];
  };
  // How far off the bond's middle a tap lands: past the mouse's reach and within the pen's or the finger's, at this zoom.
  const reaches = () => {
    const bond = 19.2 * view().zoom; // a bond's length on screen
    const mouse = 0.2 * bond, finger = Math.min(0.5, Math.max(0.2, 15 / bond)) * bond, pen = Math.min(0.5, Math.max(0.2, 9 / bond)) * bond;
    return { mouse, finger, pen };
  };
  const was = reaches(), d = (was.mouse + was.finger) / 2;
  const [on, r] = await off("mouse", 0), [mouseOff] = await off("mouse", d), [fingerOff] = await off("touch", d);
  check("a finger tap just off a bond hits it, as a mouse click on it", fingerOff === on, `${d.toFixed(1)} px off (mouse ${was.mouse.toFixed(1)}, finger ${was.finger.toFixed(1)}):\non:\n${on}\nfinger:\n${fingerOff}`);
  check("the same mouse click misses the bond, as before", mouseOff !== on, `${r.width}x${r.height}`);
  // Zoom out to about a third with Ctrl + wheel (clear of the zoom's limit, so the same steps back return), then a tap
  // in a benzene ring's middle: the finger does what the mouse does (numbers to a hundredth: the two drawings are laid
  // out apart).
  const ring = async (kind) => {
    await clear(); await pick(/^Benzene$/); await tap("mouse", [700, 450]);
    for (let k = 0; k < 12; k++) { svg.dispatchEvent(new WheelEvent("wheel", { clientX: 700, clientY: 450, deltaY: 10, ctrlKey: true, bubbles: true, cancelable: true })); await frame(); }
    await wait(300);
    const b = document.querySelector("[data-object]").getBoundingClientRect();
    await pick(/bond$/i);
    const s = await tap(kind, [(b.left + b.right) / 2, (b.top + b.bottom) / 2]);
    for (let k = 0; k < 12; k++) { svg.dispatchEvent(new WheelEvent("wheel", { clientX: 700, clientY: 450, deltaY: -10, ctrlKey: true, bubbles: true, cancelable: true })); await frame(); }
    await wait(300);
    return s.replace(/-?\d+\.\d+/g, (n) => Number(n).toFixed(2));
  };
  const mr = await ring("mouse"), fr = await ring("touch");
  check("zoomed out, a finger tap in a ring's middle does what the mouse's does", mr === fr && mr.includes("structure"), `mouse:\n${mr}\nfinger:\n${fr}`);
  // The pen last (after a pen, a finger only pans), at the zoom the rings left.
  const now = reaches(), dp = (now.mouse + now.pen) / 2;
  const [on2] = await off("mouse", 0), [mouseOff2] = await off("mouse", dp), [penOff] = await off("pen", dp);
  // At a zoom where the pen's floor is under the mouse's reach, the pen reaches as the mouse does.
  check("a pen tap just off a bond hits it, as a mouse click on it", now.pen - now.mouse < 1 ? penOff === mouseOff2 : penOff === on2, `${dp.toFixed(1)} px off (mouse ${now.mouse.toFixed(1)}, pen ${now.pen.toFixed(1)}):\non:\n${on2}\npen:\n${penOff}`);
}
// Undo during a drag: a finger's and a pen's do what the mouse's does. Undo during a pinch takes back the bond, and the
// pinch goes on (stress 15: an outside edit, as the MCP's, replaces the drawing under a press the same way).
if (part("undo")) {
  const undoMid = async (kind) => {
    await clear(); await bondFirst();
    const p = who(kind);
    if (kind !== "touch") { send("pointermove", 600, 520, { ...p, buttons: 0 }); await frame(); }
    send("pointerdown", 600, 520, p); await frame();
    for (let k = 1; k <= 6; k++) { send("pointermove", 600 + 10 * k, 520, p); await frame(); }
    key({ key: "z", code: "KeyZ", metaKey: true }); await wait(300);
    for (let k = 7; k <= 12; k++) { send("pointermove", 600 + 10 * k, 520, p); await frame(); }
    send("pointerup", 720, 520, p); await frame();
    if (kind !== "touch") send("pointermove", 1000, 700, { ...p, buttons: 0 });
    return settle();
  };
  const m = await undoMid("mouse"), f = await undoMid("touch"), pn = await undoMid("pen");
  check("Undo during a finger's drag does what it does during a mouse drag", f === m, `mouse:\n${m}\nfinger:\n${f}`);
  check("Undo during a pen's drag does what it does during a mouse drag", pn === m, `mouse:\n${m}\npen:\n${pn}`);
  await clear(); await bondFirst();
  const v0 = view(), a = who("touch"), b = who("touch");
  send("pointerdown", 560, 600, a); await wait(40);
  send("pointerdown", 760, 600, { ...b, primary: false }); await frame();
  for (let k = 1; k <= 10; k++) {
    if (k === 5) { key({ key: "z", code: "KeyZ", metaKey: true }); await wait(200); }
    send("pointermove", 560 - 4 * k, 600, a); send("pointermove", 760 + 4 * k, 600, { ...b, primary: false }); await frame();
  }
  send("pointerup", 520, 600, a); send("pointerup", 800, 600, { ...b, primary: false });
  await settle();
  check("Undo during a pinch takes back the bond, and the pinch goes on", drawn() === "" && view().zoom > v0.zoom * 1.2, `${drawn()}; zoom ${v0.zoom} to ${view().zoom}`);
}

// ——— Palm rejection (job 7, stress 7) ———
if (part("palm")) {
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
// A function (hoisted), so <url>/?editor&look-coarse runs it alone: in a 768 px window (LOOK_HEIGHT=768 for
// webkit.swift) it checks that every menu still fits.
async function coarseSection() {
  const px = (el) => el?.getBoundingClientRect();
  const same = (a, b) => a && b && Math.abs(a.left - b.left) < 0.5 && Math.abs(a.top - b.top) < 0.5 && Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5;
  // The toolbar's section (Pen, then Measure, between two lines) and the tools after it: the active mark sits on each,
  // in one column and in two. The Pen and Measure menus' options are the size of an option (size), and the Arrow
  // menu's size switch is a control that size, with its segments one size and its fill on the size chosen.
  const sectionLooks = async (name, size) => {
    const mark = document.querySelector(".palette .indicator");
    for (const wide of [false, true]) {
      if (wide) { document.querySelector(".palette-toggle")?.click(); await wait(700); }
      const off = [];
      for (const slot of [11, 12, 13, 14, 15, 16]) {
        await pickSlot(slot); await wait(400);
        const t = slotTool(slot);
        if (!same(px(t), px(mark))) off.push(`${t?.getAttribute("aria-label")}: ${JSON.stringify([px(t), px(mark)])}`);
      }
      check(`${name}: ${wide ? "two columns" : "one column"}, the active mark is on Pen, Measure and the tools before and after them`, !off.length, off.join("; "));
      if (wide) { document.querySelector(".palette-toggle")?.click(); await wait(700); }
    }
    for (const [tool, slot] of [["Pen", 12], ["Measure", 13]]) {
      await pickSlot(slot); slotTool(slot)?.click(); await wait(500);
      const cells = [...document.querySelectorAll(".palette .strip:not(.leaving) .variant")].filter((v) => v.offsetHeight);
      check(`${name}: the options in the ${tool} menu are ${size} px`, cells.length >= 2 && cells.every((v) => v.offsetHeight === size), cells.map((v) => v.offsetHeight).join(" "));
      await escape();
    }
    await pickSlot(8); slotTool(8)?.click(); await wait(500);
    const seg = document.querySelector(".palette .strip:not(.leaving) .menu-segments .segmented"), segs = seg ? [...seg.querySelectorAll(":scope > button")] : [], on = segs.find((b) => b.getAttribute("aria-checked") === "true");
    const control = size === 44 ? 44 : 28;
    check(`${name}: the Arrow menu's size switch is ${control} px, its segments one size, and its fill on the size chosen`,
      seg?.offsetHeight === control && segs.length === 3 && segs.every((b) => b.offsetHeight === control - 6 && b.offsetWidth === segs[0].offsetWidth) && same(px(on), px(seg?.querySelector(".seg-thumb"))),
      `${seg?.offsetHeight}: ${segs.map((b) => `${b.offsetWidth}x${b.offsetHeight}`).join(" ")} ${JSON.stringify([px(on), px(seg?.querySelector(".seg-thumb"))])}`);
    await escape();
  };
  const coarseLooks = async (theme) => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    await pick(/bond$/i);
    const tools = [...document.querySelectorAll(".palette .tool")];
    check(`coarse ${theme}: every tool is 44 px`, tools.length > 5 && tools.every((t) => t.offsetHeight === 44 && t.offsetWidth === 44), tools.map((t) => `${t.offsetWidth}x${t.offsetHeight}`).join(" "));
    await wait(400);
    const on = document.querySelector(".palette .tool[aria-pressed='true']"), mark = document.querySelector(".palette .indicator");
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
    more?.dispatchEvent(new PointerEvent("pointermove", { bubbles: true }));
    await wait(500);
    const menus = [...document.querySelectorAll(".context-menu")], subRows = menus.length > 1 ? [...menus[1].querySelectorAll(".variant")].filter((v) => v.offsetHeight) : [], sub = px(menus[1]?.querySelector(".strip"));
    check(`coarse ${theme}: the Actions menu's sub-menu rows are 44 px and in the window`, !!more && subRows.length > 1 && subRows.every((v) => v.offsetHeight === 44) && !!sub && sub.bottom <= innerHeight - 8 + 0.5 && sub.top >= 8 - 0.5 && sub.right <= innerWidth,
      `${more?.textContent}: ${subRows.map((v) => v.offsetHeight).join(" ")} ${JSON.stringify(sub)}`);
    await escape(); await escape();
    // A list from a button in the Actions panel (Pick: the Colour list for the structures).
    key({ key: "a", code: "KeyA", metaKey: true }); await wait(500);
    const button = [...document.querySelectorAll('.actions button[aria-haspopup="menu"]')].find((b) => b.offsetHeight);
    button?.click(); await wait(500);
    const list = document.querySelector("body > div > .strip.list"), items = list ? [...list.querySelectorAll(".variant")].filter((v) => v.offsetHeight) : [], box = px(list);
    check(`coarse ${theme}: a list menu's options are 44 px and in the window`, items.length > 1 && items.every((v) => v.offsetHeight === 44) && !!box && box.bottom <= innerHeight - 8 + 0.5 && box.top >= 8 - 0.5,
      `${button?.getAttribute("aria-label")}: ${items.map((v) => v.offsetHeight).join(" ")} ${JSON.stringify(box)}`);
    check(`a pinch on a list menu or the Actions panel does not zoom the window (${theme})`, !!items[0] && !pinchable(items[0]) && !!button && !pinchable(button));
    await escape();
    if (document.querySelector(".strip.list:not(.leaving)")) button?.click();
    await wait(300);
    // A colour row's palette (every colour as a swatch, a Menu.tsx list): its swatches are 44 px too, and it is in the window.
    document.querySelector(".colour-row .colour-more")?.click(); await wait(500);
    const palette = document.querySelector("body > div > .strip.list"), swatches = palette ? [...palette.querySelectorAll(".swatch-cell")].filter((v) => v.offsetHeight) : [], shelf = px(palette);
    check(`coarse ${theme}: a colour palette's swatches are 44 px and the palette is in the window`, swatches.length > 4 && swatches.every((v) => v.offsetHeight === 44 && v.offsetWidth === 44) && !!shelf && shelf.bottom <= innerHeight - 8 + 0.5 && shelf.top >= 8 - 0.5,
      `${swatches.length}: ${[...new Set(swatches.map((v) => `${v.offsetWidth}x${v.offsetHeight}`))].join(" ")} ${JSON.stringify(shelf)}`);
    await escape();
    await wait(300);
    await sectionLooks(`coarse ${theme}`, 44);
    await pick(/bond$/i);
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
    key({ key: "a", code: "KeyA", metaKey: true }); await wait(500);
    document.querySelector(".colour-row .colour-more")?.click(); await wait(500);
    const swatches = [...(document.querySelector("body > div > .strip.list")?.querySelectorAll(".swatch-cell") ?? [])].filter((v) => v.offsetHeight);
    check("fine again: a colour palette's swatches are 24 px", swatches.length > 4 && swatches.every((v) => v.offsetHeight === 24), swatches.map((v) => v.offsetHeight).join(" "));
    await escape();
    await sectionLooks("fine again", 36);
    await pick(/bond$/i);
  }
}
if (part("coarse")) await coarseSection();

out.look = window.__look;
out.errors = window.__errors.slice(0, 10);
return JSON.stringify(out);
