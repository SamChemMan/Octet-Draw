// node scripts/look/chrome-touch.mjs <url>/?editor. npm run look -- <url>/?editor touch runs it after the WebKit pages.
// Pen and touch on the canvas in headless Chrome, the engine of Windows' web view (WebView2), sent over the DevTools
// protocol as a touch screen and a pen send them. touch.js's events come from the page itself, so they skip what the
// browser does around real ones: a finger's implicit pointer capture on what it lands on, which moves to the canvas
// when its press goes in, the lostpointercapture after each pointerup, and the mouse events and click it sends after a
// finger's tap. Each finger and pen sequence must draw what the same mouse sequence draws, a finger's tap that opens a
// text field leaves the focus there, lifting a finger whose hold opened the Actions menu chooses nothing, a finger's
// double tap does what the mouse's double-click does, and a finger leaves no hover behind on any tool. The mouse's
// double-click on a handle or a reaction arrow does what a finger's double tap does, a long press opens one menu, two
// fingers' pan keeps the zoom, and after a pen a finger's double tap, and a palm's, does nothing. It prints
// one line of JSON, as webkit.swift does. CHROME=path picks the browser. OCTET_STRESS_URL=<url> node
// src/touch.check.ts runs it too.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const url = (process.argv[2] ?? "http://localhost:1420/?editor").replace(/[?&]look-[^&]*/g, "");
const out = { engine: "Chrome", reached: [], missed: [], errors: [] };
const chromePath = process.env.CHROME ?? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium",
  "C:/Program Files/Google/Chrome/Application/chrome.exe"].find(existsSync);
if (!chromePath) { out.missed.push("Chrome: not found (set CHROME to its path)"); console.log(JSON.stringify(out)); process.exit(0); }
const profile = mkdtempSync(join(tmpdir(), "octet-touch-chrome-")), port = 9900 + Math.floor(Math.random() * 90);
const chrome = spawn(chromePath, ["--headless=new", `--remote-debugging-port=${port}`, "--window-size=1440,900", "--no-first-run", "--no-default-browser-check",
  `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore", detached: process.platform !== "win32" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  let target;
  for (let i = 0; i < 100 && !target; i++) { await sleep(200); try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page"); } catch {} }
  if (!target) throw new Error("Chrome did not start");
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r));
  let n = 0;
  const call = (method, params = {}) => new Promise((done, fail) => {
    const id = ++n, stop = setTimeout(() => fail(new Error(`${method} took over 30 s`)), 30000);
    const on = (e) => { const m = JSON.parse(e.data); if (m.id !== id) return; clearTimeout(stop); ws.removeEventListener("message", on); m.error ? fail(new Error(`${method}: ${m.error.message}`)) : done(m.result); };
    ws.addEventListener("message", on);
    ws.send(JSON.stringify({ id, method, params }));
  });
  const run = async (code) => {
    const r = await call("Runtime.evaluate", { expression: `(async () => { ${code} })()`, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
  await call("Page.navigate", { url });
  await run(`for (let i = 0; i < 400 && !document.querySelector('svg.canvas'); i++) await new Promise((r) => setTimeout(r, 50));
    window.__errs = []; addEventListener('error', (e) => __errs.push(String(e.message)));`);
  await sleep(2500); // Indigo and the fonts
  out.engine = (await call("Browser.getVersion")).product;
  // The drawing as screen readers get it (CanvasAccess), once it has stopped changing; and an empty canvas, Bond in hand.
  // boxes: with each object's box too.
  const settled = (boxes = false) => run(`
    const read = () => [...document.querySelectorAll('[data-object]')].map((e) => [e.getAttribute('aria-roledescription'), e.getAttribute('aria-label'), e.getAttribute('aria-description')${boxes ? ", e.style.cssText" : ""}].join('|')).sort().join('\\n');
    let last = read(), since = Date.now();
    for (const t0 = Date.now(); Date.now() - t0 < 5000;) { await new Promise((r) => setTimeout(r, 100)); const now = read(); if (now !== last) { last = now; since = Date.now(); } else if (Date.now() - since > 600) break; }
    return last;`);
  // An empty canvas, and the tool in hand: the toolbar's tool at slot (0 Select, 1 Bond, 3 Ring, 5 Sequence, 8 Arrow,
  // 12 Pen, 13 Measure, 14 Text, 15 Eraser, 16 the specialist tool), with the option of its menu with the key given.
  // keep: the drawing stays.
  const fresh = (slot = 1, option = "", keep = false) => run(`
    const key = (init) => (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    key({ key: 'Escape', code: 'Escape' }); await wait(200);
    if (!${keep}) {
      key({ key: 'a', code: 'KeyA', metaKey: /Mac/.test(navigator.platform), ctrlKey: !/Mac/.test(navigator.platform) }); await wait(200);
      key({ key: 'Delete', code: 'Delete' }); await wait(200);
    }
    const tool = document.querySelectorAll('.palette .slot > button.tool')[${slot}];
    if (tool.getAttribute('aria-pressed') !== 'true') { tool.click(); await wait(250); }
    if (${JSON.stringify(option)}) {
      tool.click(); await wait(400);
      const v = document.querySelector('.palette .strip:not(.leaving) .variant[data-item=${JSON.stringify(option)}]');
      if (!v) throw new Error('no option ${option} in the menu of tool ${slot}');
      v.click(); await wait(300);
    }
    key({ key: 'Escape', code: 'Escape' }); await wait(250);`);
  // What has the focus, by its name.
  const focused = () => run("return document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.tagName;");
  const zoom = () => run("return /--zoom: ([-\\d.e]+)/.exec(document.querySelector('.canvas-access-layer')?.getAttribute('style') ?? '')?.[1];");
  // The view: where the drawing's origin is on screen, and the zoom as the page has it (a string, to the bit).
  const view = () => run(`const s = document.querySelector('.canvas-access-layer')?.getAttribute('style') ?? '', t = /translate\\(([-\\d.e]+)px, ([-\\d.e]+)px\\)/.exec(s);
    return { x: Number(t?.[1]), y: Number(t?.[2]), zoom: /--zoom: ([-\\d.e]+)/.exec(s)?.[1] };`);
  // Real keys: text as typed, and Return.
  const typeText = async (text) => { await call("Input.insertText", { text }); await sleep(150); };
  const enter = async () => {
    for (const type of ["rawKeyDown", "keyUp"]) await call("Input.dispatchKeyEvent", { type, key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    await sleep(150);
  };
  const frame = () => sleep(20);
  // A finger, a pen or the mouse, from a through the points after it, a frame apart. One point is a tap.
  const touch = async (pts) => {
    await call("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: pts[0][0], y: pts[0][1], id: 1 }] });
    for (const [x, y] of pts.slice(1)) { await frame(); await call("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y, id: 1 }] }); }
    await frame();
    await call("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  };
  const mouse = (pointerType) => async (pts) => {
    const at = (type, [x, y], o = {}) => call("Input.dispatchMouseEvent", { type, x, y, pointerType, ...o });
    await at("mouseMoved", pts[0]);
    await frame();
    await at("mousePressed", pts[0], { button: "left", buttons: 1, clickCount: 1 });
    for (const p of pts.slice(1)) { await frame(); await at("mouseMoved", p, { button: "left", buttons: 1 }); }
    await frame();
    await at("mouseReleased", pts[pts.length - 1], { button: "left", buttons: 0, clickCount: 1 });
    await frame();
    await at("mouseMoved", [pts[0][0] + 300, pts[0][1] + 200]); // away, so no hover is left
  };
  const line = (a, b, steps = 8) => Array.from({ length: steps + 1 }, (_, k) => [a[0] + ((b[0] - a[0]) * k) / steps, a[1] + ((b[1] - a[1]) * k) / steps]);
  // A point on the drawn bond's line, a tenth of its length from the atom at a: a finger there lands on the bond's
  // own element, which holds the finger's capture until the canvas takes it, and its reach still finds the atom.
  const onBond = async (a) => run(`
    const p = document.querySelector('svg.canvas path'), m = p.getScreenCTM(), L = p.getTotalLength();
    const at = (f) => { const q = p.getPointAtLength(L * f); return [q.x * m.a + q.y * m.c + m.e, q.x * m.b + q.y * m.d + m.f]; };
    const [s, e] = [at(0.1), at(0.9)], d = (q) => Math.hypot(q[0] - ${a[0]}, q[1] - ${a[1]}), q = d(s) < d(e) ? s : e;
    if (document.elementFromPoint(...q) !== p) throw new Error('the point by the atom is not on its bond');
    return q;`);
  // Each case: on a fresh canvas with Bond in hand, the mouse draws the start (an atom to press on), then the finger's
  // and the pen's stroke must draw what the mouse's draws. The pen goes last: after a pen, a finger pans.
  const atom = [[[600, 400]]];
  const CASES = [
    ["a tap on the canvas", [], () => [[600, 400]]],
    ["a drag on the canvas", [], () => line([600, 400], [680, 440])],
    ["a drag from an atom", atom, () => line([600, 400], [660, 460])],
    ["a tap on an atom", atom, () => [[600, 400]]],
    ["a drag from an atom that starts on its bond", atom, async () => line(await onBond([600, 400]), [660, 460])],
  ];
  const drawn = {}, byMouse = mouse("mouse");
  const report = (name, ok, why) => (ok ? out.reached : out.missed).push(`Chrome, ${name}${ok ? "" : `: ${why}`}`);

  // A finger's tap that opens a text field leaves the focus in it, as the mouse's click does, and what is typed there
  // goes in where the finger tapped. The finger's press goes in at the lift, and Chromium sends its mousedown for the
  // tap after that: in this page before the field opens, and in a page just loaded after it, where it took the focus.
  // So no mousedown may come at all. The Sequence tool's name field (Peptide), on the canvas and on
  // an atom; a new table's first cell; and a tap away from a caption being typed, which closes it and starts the next
  // as the mouse's click does. Each case: its setup and its step, both by the pointer under test.
  const FIELDS = [
    ["Peptide: a tap, ACDE and Return", () => fresh(5), async (act) => { await act([[600, 400]]); await sleep(500); await typeText("ACDE"); await enter(); }],
    ["Peptide: a tap on an atom", async (act) => { await fresh(); await act([[600, 400]]); await settled(); await fresh(5, "", true); }, (act) => act([[600, 400]])],
    ["Table: a tap", () => fresh(16, "table"), (act) => act([[600, 400]])],
    ["Text: a tap away from a caption being typed", async (act) => { await fresh(14); await act([[600, 400]]); await sleep(300); await typeText("THF"); }, (act) => act([[800, 500]])],
  ];
  const typed = {};
  for (const [kind, act] of [["mouse", byMouse], ["finger", touch]]) {
    for (const [name, setup, step] of FIELDS) {
      await setup(act);
      await run("window.__downs = 0; if (!window.__down) { window.__down = true; addEventListener('mousedown', (e) => { if (e.isTrusted) __downs++; }, true); }");
      await step(act);
      await sleep(400);
      const now = `${await settled(true)}\nfocus: ${await focused()}`, downs = await run("return __downs;");
      if (kind === "mouse") { typed[name] = now; continue; }
      report(`finger: ${name}`, now === typed[name] && !downs, `${downs} mousedown, drew and focused ${JSON.stringify(now)}, the mouse ${JSON.stringify(typed[name])}`);
    }
  }

  // A long press opens the Actions menu at the finger, and lifting the finger chooses nothing. The finger drifts 6 px
  // right and down while it is held (under the 10 px of a drag), so it lifts over an option, and Chromium sends its
  // click for the lift there. By the bottom of the window the menu moves up to fit, and Delete is under the finger.
  // One menu opens: the mouse's click that drew the bond leaves it at rest 300 px right of and 200 px below the bond,
  // and with a press at 800, 600 the menu opens under it, on Turn, flip and arrange (Chromium sends it a pointerover).
  // Bond in hand, a bond drawn at bond; the finger held at at.
  const HOLDS = [["on an atom", [600, 400], [600, 400]], ["on an atom by the bottom", [600, 770], [600, 770]], ["on the canvas", [500, 300], [600, 400]], ["on the canvas by the bottom", [800, 750], [600, 400]],
    ["on the canvas, the menu under the mouse at rest", [800, 600], [600, 400]]];
  for (const [name, [x, y], bond] of HOLDS) {
    await fresh();
    await byMouse([bond]);
    const was = await settled(), z = await zoom();
    await call("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 1 }] });
    await sleep(150);
    for (let k = 1; k <= 3; k++) { await sleep(30); await call("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + 2 * k, y: y + 2 * k, id: 1 }] }); }
    await sleep(260); // 500 ms in all: the menu opened at 350
    const over = await run(`return document.elementFromPoint(${x + 6}, ${y + 6})?.closest('.context-menu [data-item]')?.dataset.item ?? '';`);
    await call("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await sleep(500);
    const now = await settled(), shown = await run("return document.querySelectorAll('.context-menu').length === 1 && !document.querySelector('.name-field, [role=dialog]');");
    report(`finger: a long press ${name}, lifted over ${over || "no option"}, chooses nothing and opens one menu`, over && now === was && (await zoom()) === z && shown,
      !over ? "the finger does not lift over an option" : `the drawing ${now === was ? "is the same" : `became ${JSON.stringify(now)}`}, zoom ${z} to ${await zoom()}, ${shown ? "one menu open" : `${await run("return document.querySelectorAll('.context-menu').length;")} menus open, or a field opened`}`);
  }

  // Two fingers pan by (60, 40) in parallel. Chromium sends each finger's move in turn, so their distance changes and
  // changes back at each step: the view moves by their move, and the zoom stays to the bit (steps added up rounding).
  {
    await fresh();
    await byMouse([[600, 400]]);
    const was = await settled(), v0 = await view(), a = line([550, 450], [610, 490], 10), b = line([750, 450], [810, 490], 10);
    await call("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: a[0][0], y: a[0][1], id: 1 }] });
    await sleep(30);
    await call("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: a[0][0], y: a[0][1], id: 1 }, { x: b[0][0], y: b[0][1], id: 2 }] });
    for (let k = 1; k < a.length; k++) { await frame(); await call("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: a[k][0], y: a[k][1], id: 1 }, { x: b[k][0], y: b[k][1], id: 2 }] }); }
    await frame();
    await call("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await sleep(400);
    const v1 = await view(), now = await settled();
    report("fingers: two fingers' pan moves the view by their move and keeps the zoom", now === was && v1.zoom === v0.zoom && Math.abs(v1.x - v0.x - 60) < 1e-6 && Math.abs(v1.y - v0.y - 40) < 1e-6,
      `the drawing ${now === was ? "is the same" : "changed"}; moved ${v1.x - v0.x}, ${v1.y - v0.y}; zoom ${v0.zoom} to ${v1.zoom}`);
  }

  // The mouse leaves the canvas (for the palette), as a finger does when it lifts.
  const leaveCanvas = async () => {
    const [x, y] = await run("const r = document.querySelector('.palette').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2];");
    await call("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, pointerType: "mouse" });
    await sleep(150);
  };
  // A real key with its letter, as typed.
  const press = async (key) => {
    const k = { key, code: `Key${key.toUpperCase()}`, windowsVirtualKeyCode: key.toUpperCase().charCodeAt(0) };
    await call("Input.dispatchKeyEvent", { type: "keyDown", text: key, ...k });
    await call("Input.dispatchKeyEvent", { type: "keyUp", ...k });
    await sleep(150);
  };
  const actions = () => run("return [...document.querySelectorAll('.actions .action')].map((a) => a.getAttribute('aria-label') || a.textContent.trim()).join(', ');");

  // A finger's double tap with Select does what the mouse's double-click does: on an atom and on a bond it picks the
  // structure, on a text it types into it with nothing picked, and on an arrow it picks the arrow. Chromium sends a
  // finger's dblclick around its second tap's release, which goes in a frame after the lift, and the release then
  // picked the text being typed. The mouse's comes after its mouseup. Then N and Return go in, with the mouse off the
  // canvas as the finger is: Return on a structure picked whole puts the keyboard's hotspot on it.
  const doubleBy = (kind) => async (q) => {
    if (kind === "finger") { await touch([q]); await sleep(80); await touch([q]); return; }
    const at = (type, o = {}) => call("Input.dispatchMouseEvent", { type, x: q[0], y: q[1], pointerType: "mouse", ...o });
    await at("mouseMoved");
    await frame();
    for (const clickCount of [1, 2]) { await at("mousePressed", { button: "left", buttons: 1, clickCount }); await frame(); await at("mouseReleased", { button: "left", buttons: 0, clickCount }); await sleep(80); }
    await leaveCanvas();
  };
  const textAt = (text) => run(`const e = [...document.querySelectorAll('svg.canvas text')].find((t) => t.textContent.trim() === ${JSON.stringify(text)}); if (!e) throw new Error('no text ${text}'); const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2];`);
  const DOUBLES = [
    ["an atom", async () => { await fresh(); await byMouse([[600, 400]]); await settled(); await fresh(0, "", true); return [600, 400]; }],
    // Butane's middle bond, in the middle of its box: away from the handles a picked structure shows.
    ["a bond", async () => {
      await fresh();
      for (const q of [[600, 400], [621, 388], [641.5, 400]]) { await byMouse([q]); await settled(); }
      await fresh(0, "", true);
      return run(`const r = document.querySelector('[data-object]').getBoundingClientRect(), q = [r.left + r.width / 2, r.top + r.height / 2];
        if (!/butane/.test(document.querySelector('[data-object]').getAttribute('aria-label')) || document.elementFromPoint(...q)?.tagName !== 'path') throw new Error('no butane with its middle bond in the middle');
        return q;`);
    }],
    ["a text", async () => { await fresh(14); await byMouse([[600, 400]]); await sleep(300); await typeText("THF"); await fresh(0, "", true); return textAt("THF"); }],
    ["an arrow", async () => { await fresh(8); await byMouse(line([520, 400], [680, 400])); await settled(); await fresh(0, "", true); return [600, 400]; }],
  ];
  const doubled = {};
  for (const kind of ["mouse", "finger"]) {
    for (const [name, setup] of DOUBLES) {
      const q = await setup();
      await doubleBy(kind)(q);
      await sleep(500);
      const once = `${await settled(true)}\nactions: ${await actions()}\nfocus: ${await focused()}`;
      await typeText("N");
      await enter();
      await sleep(300);
      const now = `${once}\nthen N and Return:\n${await settled(true)}\nactions: ${await actions()}\nfocus: ${await focused()}`;
      if (kind === "mouse") { doubled[name] = now; continue; }
      report(`finger: a double tap on ${name} with Select does what the mouse's double-click does`, now === doubled[name], `got ${JSON.stringify(now)}, the mouse ${JSON.stringify(doubled[name])}`);
    }
  }

  // A double-click on a resize handle opens Scale…, on the rotation handle Rotate…, and on a reaction arrow picks the
  // reaction, by the mouse as by a finger. Chromium sends the mouse no click there, so no dblclick, as its press
  // redraws what it landed on: the canvas sends one after the second release. Select in hand.
  const dialog = () => run("return document.querySelector('[role=dialog]')?.getAttribute('aria-label') ?? '';");
  const centreOf = (sel, nth = 0) => run(`const e = document.querySelectorAll(${JSON.stringify(sel)})[${nth}]; if (!e) throw new Error('none ${sel}'); const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2];`);
  const escape = async () => { for (const type of ["rawKeyDown", "keyUp"]) await call("Input.dispatchKeyEvent", { type, key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }); await sleep(200); };
  const benzene = async () => {
    await fresh(3); await byMouse([[600, 400]]); await settled(); await fresh(0, "", true);
    await run("document.body.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'a', code: 'KeyA', metaKey: /Mac/.test(navigator.platform), ctrlKey: !/Mac/.test(navigator.platform) })); await new Promise((r) => setTimeout(r, 300));");
  };
  const HANDLES = [
    ["a resize handle opens Scale…", (got) => got.dialog === "Scale", async () => { await benzene(); return centreOf(".frame-marks .resize-handle", 2); }],
    ["the rotation handle opens Rotate…", (got) => got.dialog === "Rotate", async () => { await benzene(); return centreOf(".frame-marks .turn-handle circle"); }],
    ["a reaction arrow picks the reaction", (got) => !got.dialog && /Clean up reaction/.test(got.actions), async () => {
      await fresh(3); await byMouse([[450, 400]]); await settled(); await byMouse([[750, 400]]); await settled();
      await fresh(8, "", true); await byMouse(line([540, 400], [660, 400])); await settled(); await fresh(0, "", true);
      return [600, 400];
    }],
  ];
  for (const [name, ok, setup] of HANDLES) {
    for (const kind of ["mouse", "finger"]) {
      const q = await setup();
      await doubleBy(kind)(q);
      await sleep(500);
      const got = { dialog: await dialog(), actions: await actions() };
      report(`${kind}: a double ${kind === "mouse" ? "click" : "tap"} on ${name}`, ok(got), `got ${JSON.stringify(got)}`);
      await escape(); await escape();
    }
  }

  // A finger leaves no hover behind: it lifts off the screen. After its tap or its drag no mark of what is under it
  // stays (.mark, the Eraser's ring), and a key does what it does with nothing under the pointer, as after a mouse that
  // left the canvas: o (oxygen) for the atom under the pointer. With every tool, a tap on an atom of a bond drawn
  // first; with Bond, a tap on the canvas and a drag from the atom too. A tap's release goes in a frame after the
  // lift, and put the hover back. These come after the double taps: Mass spec analysis's panel hides the Actions panel
  // they read.
  const marks = () => run("return document.querySelectorAll('svg.canvas .mark, svg.canvas .brush').length;");
  const tapAtom = [[600, 400]];
  const HOVERS = [
    ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 14, 15].map((slot) => [`slot ${slot}`, slot, "", tapAtom]),
    ...["pen", "pen-edit"].map((key) => [key, 12, key, tapAtom]),
    ...["distance", "angle", "dihedral"].map((key) => [key, 13, key, tapAtom]),
    ...["tlc", "gel", "plasmid", "table", "fragment", "synthesis", "retro", "map", "massspec"].map((key) => [key, 16, key, tapAtom]),
    ["Bond, a tap on the canvas", 1, "", [[700, 300]]],
    ["Bond, a drag from the atom", 1, "", line([600, 400], [660, 460])],
  ];
  for (const [name, slot, option, pts] of HOVERS) {
    const got = {};
    for (const [kind, act] of [["mouse", async (p) => { await byMouse(p); await leaveCanvas(); }], ["finger", touch]]) {
      await fresh();
      await byMouse([[600, 400]]);
      await settled();
      await fresh(slot, option, true);
      const tool = await run("return document.querySelector('.palette .tool[aria-pressed=\"true\"]')?.getAttribute('aria-label');");
      await act(pts);
      await sleep(400);
      const left = await marks();
      await press("o");
      got[kind] = { tool, left, now: `${await settled(true)}\nfocus: ${await focused()}` };
    }
    const f = got.finger, m = got.mouse;
    report(`finger: ${f.tool} (${name}), ${pts.length > 1 ? "a drag" : "a tap"} leaves no hover, and o after it does what it does after a mouse that left`, f.left === 0 && f.now === m.now,
      `${f.left} marks left; o then gave ${JSON.stringify(f.now)}, after the mouse ${JSON.stringify(m.now)}`);
  }

  for (const [kind, act] of [["mouse", byMouse], ["finger", touch], ["pen", mouse("pen")]]) {
    for (const [name, start, stroke] of CASES) {
      await fresh();
      for (const s of start) { await byMouse(s); await settled(); }
      const pts = await stroke();
      await act(pts);
      const now = await settled(), was = drawn[name];
      if (kind === "mouse") { drawn[name] = now; if (!now) out.missed.push(`Chrome, mouse: ${name}: drew nothing`); continue; }
      const ok = Boolean(was) && now === was;
      (ok ? out.reached : out.missed).push(`Chrome, ${kind}: ${name}${ok ? "" : `: drew ${JSON.stringify(now || "nothing")}, the mouse ${JSON.stringify(was || "nothing")}`}`);
    }
  }
  // After a pen a finger only moves the view (the palm rule), and its double tap does nothing either: on a text, an atom
  // and a table cell with Select, Chromium still sends a dblclick. A palm's double tap while the pen is held on the
  // canvas does nothing too. Before each, the mouse draws, so it rests off the canvas. What is picked is read from its
  // marks: Mass spec analysis's panel (HOVERS) hides the Actions panel.
  const PALMS = [
    ["a text", async () => { await fresh(14); await byMouse([[600, 400]]); await sleep(300); await typeText("THF"); await fresh(0, "", true); return textAt("THF"); }],
    ["an atom", async () => { await fresh(); await byMouse([[600, 400]]); await settled(); await fresh(0, "", true); return [600, 400]; }],
    ["a table cell", async () => { await fresh(16, "table"); await byMouse([[600, 400]]); await sleep(400); await typeText("ab"); await fresh(0, "", true); return textAt("ab"); }],
  ];
  const pen = (type, [x, y], o = {}) => call("Input.dispatchMouseEvent", { type, x, y, pointerType: "pen", ...o });
  for (const held of [false, true]) {
    for (const [name, setup] of PALMS) {
      const q = await setup();
      await leaveCanvas();
      await sleep(400);
      const state = async () => `${await settled(true)}\npicked: ${await run("return document.querySelectorAll('svg.canvas .selection-marks > *').length;")}\nfocus: ${await focused()}`;
      const was = await state();
      if (held) { await pen("mouseMoved", [300, 250]); await frame(); await pen("mousePressed", [300, 250], { button: "left", buttons: 1, clickCount: 1 }); await sleep(100); }
      await touch([q]); await sleep(80); await touch([q]); await sleep(400);
      const now = await state();
      if (held) { await pen("mouseReleased", [300, 250], { button: "left", buttons: 0, clickCount: 1 }); await sleep(300); }
      report(`${held ? "palm: a double tap while the pen is held" : "finger: after a pen, a double tap"} on ${name} with Select does nothing`, now === was, `before ${JSON.stringify(was)}, after ${JSON.stringify(now)}`);
      await escape(); await escape();
    }
  }

  out.errors = await run("return __errs.slice(0, 10);");
  ws.close();
} catch (e) {
  out.missed.push(`Chrome: ${e.message}`);
} finally {
  // Chrome and its helpers (its own process group), then its profile.
  const gone = new Promise((r) => chrome.once("exit", r));
  try { process.kill(process.platform === "win32" ? chrome.pid : -chrome.pid); } catch { chrome.kill(); }
  await Promise.race([gone, sleep(5000)]);
  try { process.kill(-chrome.pid, "SIGKILL"); } catch { /* all gone */ }
  rmSync(profile, { recursive: true, force: true });
}
console.log(JSON.stringify(out));
