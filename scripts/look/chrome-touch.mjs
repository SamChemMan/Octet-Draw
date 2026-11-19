// node scripts/look/chrome-touch.mjs <url>/?editor. npm run look -- <url>/?editor touch runs it after the WebKit pages.
// Pen and touch on the canvas in headless Chrome, the engine of Windows' web view (WebView2), sent over the DevTools
// protocol as a touch screen and a pen send them. touch.js's events come from the page itself, so they skip what the
// browser does around real ones: a finger's implicit pointer capture on what it lands on, which moves to the canvas
// when its press goes in, the lostpointercapture after each pointerup, and the mouse events and click it sends after a
// finger's tap. Each finger and pen sequence must draw what the same mouse sequence draws, a finger's tap that opens a
// text field leaves the focus there, and lifting a finger whose hold opened the Actions menu chooses nothing. It prints
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
  // An empty canvas, and the tool in hand: the toolbar's tool at slot (1 Bond, 5 Sequence, 12 Text, 14 the specialist
  // tool), with the option of its menu with the key given. keep: the drawing stays.
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
    ["Table: a tap", () => fresh(14, "table"), (act) => act([[600, 400]])],
    ["Text: a tap away from a caption being typed", async (act) => { await fresh(12); await act([[600, 400]]); await sleep(300); await typeText("THF"); }, (act) => act([[800, 500]])],
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
  // Bond in hand, a bond drawn at bond; the finger held at at.
  const HOLDS = [["on an atom", [600, 400], [600, 400]], ["on an atom by the bottom", [600, 770], [600, 770]], ["on the canvas", [500, 300], [600, 400]], ["on the canvas by the bottom", [800, 750], [600, 400]]];
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
    const now = await settled(), shown = await run("return !!document.querySelector('.context-menu') && !document.querySelector('.name-field, [role=dialog]');");
    report(`finger: a long press ${name}, lifted over ${over || "no option"}, chooses nothing`, over && now === was && (await zoom()) === z && shown,
      !over ? "the finger does not lift over an option" : `the drawing ${now === was ? "is the same" : `became ${JSON.stringify(now)}`}, zoom ${z} to ${await zoom()}, ${shown ? "the menu open" : "the menu closed or a field opened"}`);
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
