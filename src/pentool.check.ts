// Run: node src/pentool.check.ts. The Pen tool (Sam, 19 November 2026): Pen and Edit curve, options of the Shape tool
// up to 1.1.2, are one tool of their own, Pen, with Edit curve as its other option, as ChemDraw's Pen tools are. It has a
// slot in a section of the toolbar after Bracket, with a line above it and one below. Drawing and editing curves work
// as before; only the tool that reaches them is new. A 1.1.2 user's settings come over: a Shape choice of Pen or Edit
// curve is the Pen tool's (the Shape tool takes its default), and a shortcut pinned to either is the Pen tool's.
//   OCTET_STRESS_URL=<url>  the dev server (npx vite --port 1520): the app in WebKit (scripts/look/webkit.swift) with a
//                           1.1.2 user's settings, in a tall window (one column, then two) and a short one (two columns
//                           by itself), driven by pointer and key events.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { isPen, movePens, movePin, movePins, PENS } from "./kinds.ts";
import { ACTIONS, actionFor, keymap, optionCommand } from "./keys.ts";

const read = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");
const tools = read("tools.tsx"), editor = read("Editor.tsx"), elements = read("elements.tsx"), settings = read("settings.ts"), commands = read("CommandPalette.tsx");

// The settings Octet 1.1.2 saves for a user who drew with Shape > Edit curve last, pinned Pen, Edit curve, an oval and
// an equilibrium arrow, gave the Shape tool and the Eraser keys, and widened the Shape menu. Made by 1.1.2's own
// loadSettings and saveSettings (src/settings.ts at the v1.1.2 tag, run through Vite's SSR loader in a copy of the
// tag's src), with only those choices changed.
const SAVED_112 = `{"snap":true,"snapGrid":false,"guides":{"grid":false,"rulers":false,"crosshair":false},"rulerUnit":"mm","eraser":0.15,"keys":{"tool.shape":["shift+v"],"tool.erase":["k"]},"variants":{"select":"box","bond":"single","ring":"benzene","template":"lib:Alanine","symbol":"plus","orbital":"p-shaded","arrow":"reaction","cycle":"circle","sequence":"peptide","shape":"pen-edit","bracket":"brackets","more":"tlc"},"strips":{"shape":584},"actions":true,"templates":[],"pinned":["arrow:equilibrium","shape:pen","shape:pen-edit","shape:oval-plain"],"actionLayout":{},"layoutVersion":3,"folded":[],"panelMenus":false,"captionOptionReturn":false,"userName":"","tutorialDone":true,"experimentNoted":false,"riskNew":true,"riskNoted":false,"seenNotes":"","homeLayout":{"order":["new","templates","recent","projects"],"folded":[]},"updates":true,"wordClick":false,"warnings":true,"warningTypes":{},"checkCopy":false,"pairBars":false,"outlines":true,"windows":true,"lastSeen":0,"purpose":"quick","purposeStyles":{},"ownPurposes":[],"files":{"format":"pdf","dpi":600,"background":"transparent","margin":4,"quality":95,"clipboard":{"office":true,"pdf":true,"cdx":true,"cdxml":true,"mol":true,"smiles":true},"keepStyle":true,"saveAs":"oct","quick":"png"},"settingsModule":"document","curvedArrows":["curved-120","fishhook-120"],"libraryRings":[],"palettes":[],"librarySize":"medium","dictionary":[],"templateSets":[],"nameHistory":[],"paletteWide":false,"palette":[],"elementColours":{},"properties":false,"propertyRows":["formula","weight"],"nmrMhz":400,"nmrSolvent":"CDCl₃","nmrSolventPeaks":true,"nmrDetails":false,"nmrLabels":"auto","massSpec":{"mode":"combinatorial","ion":"M+H","z":1,"source":"ESI","calc":"mono","tolerance":"5ppm"},"scaleLabels":true,"onlineSearch":true,"moreFormats":false,"fixedLengths":true,"fixedAngles":true,"sproutRings":false,"clickTriple":false,"interpretation":false,"autoMap":true,"stereoParens":true,"hideAbs":false,"mdlFlags":false,"aromaticOnOpen":"","massUnit":"g","cursor":"auto","selectColour":"#3F6BFF","sequenceLabels":false,"labelReturnNewLine":false}`;

// --- The tool and the toolbar -------------------------------------------------------------------------------------
{
  const union = tools.match(/^export type Tool = (.+);$/m)![1].split("|").map((t) => t.trim().replace(/"/g, ""));
  assert.equal(union[union.indexOf("bracket") + 1], "pen", "Pen is a tool");
  assert.deepEqual(PENS, { pen: "Pen", "pen-edit": "Edit curve" }, "its two options, named as before");
  assert.match(tools, /export const SECTION: Tool\[\] = \["pen", "measure"\];/, "the section holds Pen, then Measure");
  // The toolbar: Bracket, then the section, then Text; a line before the section's first tool and after its last.
  const order = [...tools.matchAll(/^    \{ id: "(\w+)", name:/gm)].map((m) => m[1]);
  assert.deepEqual(order.slice(order.indexOf("bracket"), order.indexOf("bracket") + 4), ["bracket", "pen", "measure", "text"]);
  assert.match(tools, /const line = i > 0 && SECTION\.includes\(t\.id\) !== SECTION\.includes\(tools\[i - 1\]\.id\);/);
  assert.match(tools, /\{place\[i\]\.line && <hr \/>\}\s+<div className="slot" data-col=\{wide \? place\[i\]\.col : undefined\}/, "the lines are the toolbar's own, and a column counts from the line");
  assert.match(tools, /\{ id: "pen", name: PENS\[p\.variants\.pen\] \?\? "Pen", icon: <PenGlyph v=\{p\.variants\.pen\} \/> \}/, "the slot shows the option last used, by its name");
  assert.match(tools, /tool === "pen" \? Object\.keys\(PENS\)/, "the Pen menu has both options");
  // The Shape menu has neither.
  assert.match(elements, /export const SHAPE_EXTRA = \["highlight", "rgroup", "line-membrane"\];/);
  assert.doesNotMatch(elements, /v === "pen"\)|"pen" in spec|"edit" in spec/, "no Shape option draws or edits a curve");
}

// --- The editor reaches Pen and Edit curve from the Pen tool only, and they work as before --------------------------
{
  assert.match(editor, /const penChoice = isPen\(settings\.variants\.pen\) \? settings\.variants\.pen : "pen";/);
  assert.match(editor, /const penDraw = tool === "pen" && penChoice === "pen", editCurve = tool === "pen" && penChoice === "pen-edit";/);
  assert.doesNotMatch(editor, /"pen" in shapePick|"edit" in shapePick/);
  // A press with the Pen places a point and starts the hold: held still, Select takes over (every tool's hold).
  assert.match(editor, /if \(penDraw\) \{\n\s+if \(pen && pen\.length >= 2 [^\n]+return finishPen\(true\);\n\s+setDrag\(\{ kind: "pen", at: p, start: screen \}\);\n\s+return startHold\(p, t, screen\);/);
  // Putting the Pen down (another tool, Edit curve, or Select from a hold) ends its curve.
  assert.match(editor, /useEffect\(\(\) => \{ if \(pen && !penDraw\) finishPen\(\); \}, \[penDraw\]\);/);
  // The command palette lists both with the tools, with their keys; Settings lists tool.pen and tool.editcurve.
  assert.match(editor, /\.\.\.variants\("pen", "pen", Object\.entries\(PENS\)\.map\(\(\[k, n\]\) => \[k, n, <PenGlyph v=\{k\} \/>\]\), "Tools", /);
  assert.deepEqual(["tool.pen", "tool.editcurve"].map((id) => ACTIONS.find((a) => a.id === id)?.name), ["Pen tool", "Edit curve tool"]);
  assert.deepEqual(Object.keys(PENS).map((k) => optionCommand("pen", k)), ["tool.pen", "tool.editcurve"]);
  // Settings > Keyboard shortcuts lists the actions in their order: Pen tool and Edit curve tool come after Bracket
  // tool, then Measure tool and its variants', as the toolbar has them.
  const at = (id: string) => ACTIONS.findIndex((a) => a.id === id);
  assert.deepEqual(["tool.pen", "tool.editcurve", "tool.measure", "tool.measureLength", "tool.measureAngle", "tool.measureDihedral"].map(at), [1, 2, 3, 4, 5, 6].map((k) => at("tool.bracket") + k), "Pen tool, Edit curve tool and Measure tool after Bracket tool");
  assert.match(read("SettingsWindow.tsx"), /\.\.\.ACTIONS\.map\(\(a\) => d\("keys", a\.group, a\.name, /, "Settings lists the actions in order");
  // Edit curve, as under the Shape tool (release-1.1.3 e5af1273): pressed on an atom or bond it has the Shape tool's
  // drag, so a click adds a point and a drag adds none and draws nothing.
  assert.match(editor, /tool === "plasmid" \|\| tool === "table" \|\| tool === "pen"\) return setDrag\(\{ kind: "shape", from: p, start: screen, target: t \}\);/);
  assert.match(editor, /const spec = tool === "bracket" \? bracketPick : tool === "shape" \? shapePick : undefined;\n\s+if \(!spec \|\| !\("shape" in spec\)\) return undefined;/, "the drag draws no shape");
  // Edit curve with a curve picked: a press off the curve is a click (a point at the curve's end) and starts the hold,
  // so held still, Select takes over, as with every tool.
  assert.match(editor, /if \(editCurve && editPress\.current !== undefined && t\.arrow === undefined && t\.caption === undefined && t\.atom === undefined\) \{ setDrag\(\{ kind: "click", at: p, start: screen, target: t \}\); return startHold\(p, t, screen\); \}/);
}

// --- Settings from 1.1.2 ----------------------------------------------------------------------------------------------
{
  const saved = JSON.parse(SAVED_112);
  assert.equal(saved.variants.shape, "pen-edit", "the fixture is a 1.1.2 Shape choice");
  // loadSettings's variants, read from settings.ts and run as it runs them (settings.ts needs the bundler to load).
  const defaults = new Function(`return ${/const DEFAULTS: Settings = \{[^\n]*?variants: (\{[^}]*\})/.exec(settings)![1]};`)();
  const line = /variants: (\{ \.\.\.DEFAULTS\.variants, \.\.\.movePens\(saved\.variants\), [^\n]+\}),\n/.exec(settings);
  assert.ok(line, "loadSettings moves Pen and Edit curve over");
  const variantsOf = (s: Record<string, unknown>) => new Function("DEFAULTS", "saved", "movePens", `return ${line![1]};`)({ variants: defaults }, s, movePens);
  assert.match(settings, /pinned: movePins\(list<string>\(saved\.pinned, \(k\) => typeof k === "string"\)\),/, "and the pins");
  const v = variantsOf(saved);
  assert.equal(v.shape, "box-plain", "the Shape tool takes its default");
  assert.equal(v.pen, "pen-edit", "the Pen tool has the option last used");
  for (const k of ["select", "bond", "ring", "arrow", "bracket", "more"]) assert.equal(v[k], saved.variants[k], k);
  assert.deepEqual(movePins(saved.pinned), ["arrow:equilibrium", "pen:pen", "pen:pen-edit", "shape:oval-plain"], "the pins to Pen and Edit curve are the Pen tool's; others stay");
  // Pen pinned in 1.1.3 and Shape > Pen pinned in 1.1.2 (opened in between): one shortcut, where the first was.
  assert.deepEqual(movePins(["pen:pen", "arrow:equilibrium", "shape:pen", "shape:pen-edit", "pen:pen-edit"]), ["pen:pen", "arrow:equilibrium", "pen:pen-edit"], "each pin once");
  // The command palette's recent commands use the same ids (shape:pen in 1.1.2, pen:pen now), and move the same way.
  assert.match(commands, /const recent = \(\): string\[\] => \{ try \{ const v = JSON\.parse\(localStorage\.getItem\(RECENT\) \?\? "\[\]"\); return Array\.isArray\(v\) \? movePins\(v\.filter\(\(x\) => typeof x === "string"\)\) : \[\]; \}/, "recent commands from 1.1.2");
  // Keys: 1.1.2 had no command for Pen or Edit curve (its keys.ts), so no saved key names them. The keys saved carry
  // over as they are, and the Pen commands have none.
  const keys = keymap(saved.keys);
  assert.deepEqual([keys["tool.shape"], keys["tool.erase"], keys["tool.pen"], keys["tool.editcurve"]], [["shift+v"], ["k"], [], []]);
  assert.equal(actionFor(keys, "shift+v", "none"), "tool.shape");
  // A 1.1.2 Shape choice of Pen; any other Shape choice; settings saved by this version; and damaged ones.
  assert.deepEqual([variantsOf({ variants: { shape: "pen" } }).shape, variantsOf({ variants: { shape: "pen" } }).pen], ["box-plain", "pen"]);
  assert.deepEqual([variantsOf({ variants: { shape: "oval-dashed" } }).shape, variantsOf({ variants: { shape: "oval-dashed" } }).pen], ["oval-dashed", "pen"]);
  assert.deepEqual([variantsOf({ variants: { shape: "box-plain", pen: "pen-edit" } }).shape, variantsOf({ variants: { shape: "box-plain", pen: "pen-edit" } }).pen], ["box-plain", "pen-edit"]);
  assert.deepEqual([movePens(null), movePens("pen"), movePens({ shape: "toString" }), variantsOf({}).pen], [{}, {}, { shape: "toString" }, "pen"]);
  assert.deepEqual(["shape:pens", "shape:pen-edit2", "pen:pen", "shape:"].map(movePin), ["shape:pens", "shape:pen-edit2", "pen:pen", "shape:"]);
  assert.deepEqual([isPen("pen"), isPen("pen-edit"), isPen("toString"), isPen(undefined)], [true, true, false, false]);
}
console.log("pentool.check: the tool, the toolbar and 1.1.2's settings ok");

// --- The app in WebKit --------------------------------------------------------------------------------------------
// penStress runs in the page (scripts/look/webkit.swift runs the body it is given), so it uses nothing from this
// file. It reads the drawing from the editor's undo history (React's own records, as energylevels-stress.check
// does) and drives the toolbar and the canvas with pointer and key events.
const ui = process.env.OCTET_STRESS_URL;
if (!ui) console.log("pentool.check: the app in WebKit skipped: set OCTET_STRESS_URL to the dev server (npx vite --port 1520)");
else if (process.platform !== "darwin" || spawnSync("which", ["swift"]).status !== 0) console.log("pentool.check: the app in WebKit skipped: it needs a Mac with Xcode's swift");
else {
  assert.ok(!SAVED_112.includes('"##'), "the settings fit a Swift raw string");
  const dir = mkdtempSync(join(tmpdir(), "octet-pen-")), runner = readFileSync(new URL("../scripts/look/webkit.swift", import.meta.url), "utf8");
  try {
    for (const [how, height, dark] of [["a tall window", 1100, false], ["a short window", 640, false], ["a tall window, dark", 1100, true]] as const) {
      // The runner, with storage of its own (none from another run), the 1.1.2 settings in place before the page loads,
      // the window's height, and the appearance.
      const swift = runner.replace("let config = WKWebViewConfiguration()", `let config = WKWebViewConfiguration()\nconfig.websiteDataStore = .nonPersistent()\nconfig.userContentController.addUserScript(WKUserScript(source: ##"localStorage.setItem("octet.settings", JSON.stringify(${SAVED_112}));"##, injectionTime: .atDocumentStart, forMainFrameOnly: true))`)
        .replace("width: 1440, height: 900", `width: 1440, height: ${height}`)
        .replace("app.setActivationPolicy(.accessory)", `app.setActivationPolicy(.accessory)${dark ? "\napp.appearance = NSAppearance(named: .darkAqua)" : ""}`);
      assert.ok(swift.includes(".nonPersistent()") && swift.includes(`height: ${height}`), "the runner took the changes");
      writeFileSync(join(dir, "run.swift"), swift);
      writeFileSync(join(dir, "pen.js"), `return await (${penStress.toString()})(${height < 700}, ${dark});`);
      const run = spawnSync("swift", [join(dir, "run.swift"), ui, join(dir, "pen.js")], { encoding: "utf8", timeout: 300_000 });
      let out: { cases: { id: string; title: string; ok: boolean; note?: string }[]; errors: string[] };
      try { out = JSON.parse(run.stdout.trim().split("\n").pop()!); } catch { throw new Error(`${how}: the WebKit run did not finish: ${run.stdout.slice(-400)}${run.stderr.slice(-400)}`); }
      for (const c of out.cases) console.log(`  ${c.ok ? "ok" : "FAILED"} ${how}: ${c.id} ${c.title}${c.note ? ` (${c.note})` : ""}`);
      assert.deepEqual(out.cases.filter((c) => !c.ok).map((c) => c.id), [], `${how}: cases that failed`);
      assert.ok(out.cases.length >= (height < 700 ? 2 : 12), `${how}: ${out.cases.length} cases ran`);
      assert.deepEqual(out.errors, [], `${how}: errors on the page`);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
  console.log("pentool.check: the app in WebKit ok");
}

async function penStress(short: boolean, dark: boolean) {
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const until = async <T,>(find: () => T, ms = 10000): Promise<T | null> => { const t = Date.now(); while (Date.now() - t < ms) { const v = find(); if (v) return v; await wait(100); } return null; };
  const out = { cases: [] as { id: string; title: string; ok: boolean; note?: string }[], errors: [] as string[] };
  const result = (id: string, title: string, ok: unknown, note?: string) => out.cases.push({ id, title, ok: !!ok, ...(note ? { note } : {}) });
  const step = async (id: string, title: string, f: () => Promise<void>) => { try { await f(); } catch (e) { result(id, title, false, `the script stopped: ${(e as Error)?.message}`); } };
  // One key event, on the window (the editor's keys listen there).
  const key = (init: KeyboardEventInit) => window.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));
  const ev = (type: string, [x, y]: number[], extra: PointerEventInit = {}) => (document.elementFromPoint(x, y) ?? document.body).dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: type === "pointerup" ? 0 : 1, pointerId: 1, pointerType: "mouse", isPrimary: true, ...extra }));
  // Each event in a task of its own, as a person's are, so the editor has drawn what the last one did.
  const click = async (p: number[], extra: PointerEventInit = {}) => { ev("pointermove", p, { buttons: 0 }); await wait(40); ev("pointerdown", p, extra); await wait(60); ev("pointerup", p, extra); await wait(250); };
  const drag = async (p: number[], q: number[]) => { ev("pointermove", p, { buttons: 0 }); await wait(40); ev("pointerdown", p); await wait(60); for (let k = 1; k <= 6; k++) { ev("pointermove", [p[0] + ((q[0] - p[0]) * k) / 6, p[1] + ((q[1] - p[1]) * k) / 6]); await wait(40); } ev("pointerup", q); await wait(300); };
  const press = async (init: KeyboardEventInit) => { key(init); await wait(350); };
  // The editor's undo history (history.ts): the drawing is stack[at].
  const editorFiber = () => { const root = document.getElementById("root") as any, k = Object.keys(root).find((x) => x.startsWith("__reactContainer"))!, stack = [root[k].stateNode.current]; while (stack.length) { const f = stack.pop(); if (!f) continue; if (f.type?.name === "Editor") return f; if (f.sibling) stack.push(f.sibling); if (f.child) stack.push(f.child); } };
  const hist = () => { let h = editorFiber()?.memoizedState; while (h) { const v = h.memoizedState; if (v && Array.isArray(v.stack) && typeof v.at === "number") return v; h = h.next; } };
  const doc = () => hist().stack[hist().at];
  const curves = () => (doc().arrows ?? []).filter((a: any) => a.kind === "curve" && a.curve);
  // The toolbar: its slots' buttons, the tool in hand, the shortcuts.
  const palette = () => document.querySelector(".palette")!;
  const slots = () => [...palette().querySelectorAll<HTMLElement>(":scope > .slot > .tool")];
  const slot = (name: string) => slots().find((b) => b.getAttribute("aria-label") === name);
  const pin = (key: string) => palette().querySelector<HTMLElement>(`[data-pin="${key}"]`);
  const inHand = () => palette().querySelector('.tool[aria-pressed="true"]')?.getAttribute("aria-label") ?? "";
  const indicator = () => palette().querySelector<HTMLElement>(".indicator")!;
  // The indicator at rest: no transition running, and in the same place a moment later.
  const settled = async () => { let last = ""; await until(() => { const r = indicator().getBoundingClientRect(), now = `${r.left},${r.top}`, still = now === last && !indicator().getAnimations().length; last = now; return still; }, 3000); };
  const off = (a: DOMRect, b: DOMRect) => Math.max(Math.abs(a.left - b.left), Math.abs(a.top - b.top), Math.abs(a.width - b.width), Math.abs(a.height - b.height));

  await until(() => document.querySelector(".home, .editor"));
  await wait(1200);
  [...document.querySelectorAll("button")].find((b) => b.textContent!.trim() === "Skip")?.click();
  await wait(600);
  (document.querySelector(".home-tile.new") as HTMLElement | null)?.click();
  await until(() => document.querySelector(".palette .slot"));
  [...document.querySelectorAll(".coach button")].find((b) => /skip/i.test(b.textContent ?? ""))?.click();
  await wait(800);

  await step("T1", "The toolbar: Pen, then Measure, in a section of their own after Bracket, between two lines; the 1.1.2 choices and pins came over", async () => {
    const kids = [...palette().children], at = (b?: HTMLElement) => (b ? kids.indexOf(b.parentElement!) : -1), b = at(slot("Brackets")), pen = at(slot("Edit curve")), measure = at(slot("Measure length")), text = at(slot("Text"));
    const shape = !!slot("Box"), pins = [...palette().querySelectorAll("[data-pin]")].map((x) => x.getAttribute("data-pin"));
    const wide = palette().classList.contains("wide"), dark2 = matchMedia("(prefers-color-scheme: dark)").matches;
    result("T1", "The toolbar: Pen, then Measure, in a section of their own after Bracket, between two lines; the 1.1.2 choices and pins came over",
      b > 0 && kids[b + 1]?.tagName === "HR" && pen === b + 2 && measure === pen + 1 && kids[measure + 1]?.tagName === "HR" && text === measure + 2 && shape && pins.join(" ") === "arrow:equilibrium pen:pen pen:pen-edit shape:oval-plain" && wide === short && dark2 === dark,
      `Bracket at ${b}, Pen (Edit curve) at ${pen}, Measure at ${measure}, Text at ${text}, Shape shows Box ${shape}, pins ${pins.join(" ")}, two columns ${wide}, dark ${dark2}`);
  });

  await step("T2", "The indicator sits on the tool in hand, every tool, before and after the lines", async () => {
    const miss: string[] = [];
    const sweep = async (where: string) => {
      for (const b of slots()) {
        if (b.getAttribute("aria-pressed") !== "true") { b.click(); await until(() => b.getAttribute("aria-pressed") === "true", 3000); }
        await settled();
        const d = off(indicator().getBoundingClientRect(), b.getBoundingClientRect());
        if (d > 0.5) miss.push(`${where}: ${b.getAttribute("aria-label")} ${d.toFixed(1)} px off`);
      }
    };
    await sweep(short ? "two columns (short window)" : "one column");
    if (!short) {
      (document.querySelector('[aria-label="Two columns"]') as HTMLElement | null)?.click();
      await until(() => palette().classList.contains("wide"), 2000);
      await wait(500);
      await sweep("two columns");
      // In two columns a section starts a row: Pen on the left and Measure beside it, with the tool before the line on
      // the row above.
      const pen = slot("Edit curve") ?? slot("Pen"), r = pen?.getBoundingClientRect(), first = slots()[0].getBoundingClientRect(), m = slots().find((x) => /^Measure/.test(x.getAttribute("aria-label") ?? ""))?.getBoundingClientRect();
      if (!r || Math.abs(r.left - first.left) > 0.5) miss.push("two columns: Pen is not at the start of its row");
      if (!r || !m || Math.abs(m.top - r.top) > 0.5 || m.left <= r.left) miss.push("two columns: Measure is not beside Pen");
      (document.querySelector('[aria-label="One column"]') as HTMLElement | null)?.click();
      await until(() => !palette().classList.contains("wide"), 2000);
      await wait(500);
    }
    // A pinned option chosen takes the indicator from its tool's slot.
    pin("pen:pen-edit")?.click();
    await until(() => pin("pen:pen-edit")?.getAttribute("aria-pressed") === "true", 3000);
    await settled();
    const lit = pin("pen:pen-edit")!, d = off(indicator().getBoundingClientRect(), lit.getBoundingClientRect());
    if (d > 0.5 || lit.getAttribute("aria-pressed") !== "true" || slot("Edit curve")?.getAttribute("aria-pressed") === "true") miss.push(`the Edit curve shortcut: ${d.toFixed(1)} px off`);
    result("T2", "The indicator sits on the tool in hand, every tool, before and after the lines", !miss.length, miss.join("; "));
  });
  if (short) return JSON.stringify(out);

  const canvas = document.querySelector("svg.canvas")!.getBoundingClientRect(), cx = canvas.left + canvas.width * 0.55, cy = canvas.top + canvas.height * 0.5;
  const A = [cx - 160, cy], B = [cx - 60, cy - 60], B2 = [cx - 20, cy - 90], C = [cx + 90, cy + 20];

  await step("T3", "The Pen (its shortcut): clicks and a drag place a corner, a smooth point and a corner; Return ends the curve, as one step", async () => {
    pin("pen:pen")!.click();
    await until(() => pin("pen:pen")!.getAttribute("aria-pressed") === "true", 3000);
    const before = curves().length, at0 = hist().at;
    await click(A);
    await drag(B, B2);
    await click(C);
    const shown = document.querySelectorAll(".pen-points rect").length;
    await press({ key: "Enter", code: "Enter" });
    const c = curves().at(-1), pts = c?.curve.points ?? [];
    result("T3", "The Pen (its shortcut): clicks and a drag place a corner, a smooth point and a corner; Return ends the curve, as one step",
      curves().length === before + 1 && pts.length === 3 && !pts[0].c2 && pts[1].c1 && pts[1].c2 && !pts[2].c1 && hist().at === at0 + 1 && shown >= 3 && pin("pen:pen")!.getAttribute("aria-pressed") === "true",
      `curves ${before} → ${curves().length}, points ${pts.length}, smooth middle ${!!pts[1]?.c2}, undo steps ${hist().at - at0}, squares shown ${shown}`);
  });

  await step("T4", "Escape ends a curve; Delete takes back its last point; a tool change ends one too", async () => {
    const n0 = curves().length;
    await click([cx - 160, cy + 120]); await click([cx - 60, cy + 120]);
    await press({ key: "Escape", code: "Escape" });
    const esc = curves().length === n0 + 1 && curves().at(-1).curve.points.length === 2;
    await click([cx - 160, cy + 180]); await click([cx - 60, cy + 180]); await click([cx + 40, cy + 180]);
    await press({ key: "Backspace", code: "Backspace" });
    await press({ key: "Enter", code: "Enter" });
    const del = curves().length === n0 + 2 && curves().at(-1).curve.points.length === 2;
    await click([cx - 160, cy + 240]); await click([cx - 60, cy + 240]);
    slot("Text")!.click();
    await until(() => inHand() === "Text", 3000);
    await wait(200);
    const change = curves().length === n0 + 3 && curves().at(-1).curve.points.length === 2;
    pin("pen:pen")!.click();
    await until(() => pin("pen:pen")!.getAttribute("aria-pressed") === "true", 3000);
    result("T4", "Escape ends a curve; Delete takes back its last point; a tool change ends one too", esc && del && change, `Escape ${esc}, Delete ${del}, Text tool ${change}`);
  });

  await step("T5", "Hold to Select with the Pen: a still press gives Select until it is let go, and ends a curve being drawn", async () => {
    const n0 = curves().length, p = [cx + 200, cy - 160];
    ev("pointermove", p, { buttons: 0 }); await wait(40); ev("pointerdown", p);
    const held = !!(await until(() => inHand() === "Select", 3000));
    for (let k = 1; k <= 4; k++) { ev("pointermove", [p[0] + 15 * k, p[1] + 15 * k]); await wait(40); }
    ev("pointerup", [p[0] + 60, p[1] + 60]);
    await until(() => inHand() === "Pen", 3000);
    const back = inHand() === "Pen", none = curves().length === n0;
    // Mid-curve: two points, then a still press: the curve ends with its two points, and Select takes over.
    await click([cx + 200, cy + 60]); await click([cx + 280, cy + 60]);
    const q = [cx + 360, cy + 60];
    ev("pointermove", q, { buttons: 0 }); await wait(40); ev("pointerdown", q);
    await until(() => inHand() === "Select", 3000);
    await wait(300);
    const mid = inHand() === "Select" && curves().length === n0 + 1 && curves().at(-1).curve.points.length === 2;
    ev("pointerup", q);
    await until(() => inHand() === "Pen", 3000);
    result("T5", "Hold to Select with the Pen: a still press gives Select until it is let go, and ends a curve being drawn", held && back && none && mid && inHand() === "Pen",
      `Select while held ${held}, Pen after ${back}, nothing drawn ${none}, mid-curve ${mid}, in hand now ${inHand()}`);
  });

  await step("T6", "Edit curve (its shortcut): a click picks the curve; a click away adds a point at its end, Option-click takes one out, a drag moves one", async () => {
    pin("pen:pen-edit")!.click();
    await until(() => pin("pen:pen-edit")!.getAttribute("aria-pressed") === "true", 3000);
    const first = curves()[0], id = first.id, n = () => doc().arrows.find((a: any) => a.id === id).curve.points.length;
    await click(A);
    const squares = () => [...document.querySelectorAll(".pen-points rect")].map((r) => { const b = r.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; });
    const picked = (await until(() => squares().length === 3, 2000)) !== null;
    const n0 = n();
    await click([cx + 160, cy - 100]);
    const added = n() === n0 + 1;
    const sq = (await until(() => squares().length === n0 + 1 && squares(), 2000)) || [];
    if (sq.length > 1) await click(sq[1], { altKey: true });
    const removed = n() === n0;
    const before = doc().arrows.find((a: any) => a.id === id).curve.points[0].at;
    const s0 = squares()[0];
    if (s0) await drag(s0, [s0[0] + 30, s0[1] + 40]);
    const after = doc().arrows.find((a: any) => a.id === id).curve.points[0].at, moved = Math.hypot(after[0] - before[0], after[1] - before[1]) > 0.5;
    const stays = inHand() === "Edit curve" && pin("pen:pen-edit")!.getAttribute("aria-pressed") === "true";
    result("T6", "Edit curve (its shortcut): a click picks the curve; a click away adds a point at its end, Option-click takes one out, a drag moves one", picked && added && removed && moved && stays,
      `picked ${picked}, added ${added}, Option-click removed ${removed}, moved ${moved}, Edit curve in hand ${stays}`);
  });

  await step("T7", "The Shape menu has no Pen; the Pen menu has Pen and Edit curve; a press, hold, slide and release on the Pen slot picks one", async () => {
    const shape = slot("Box")!;
    shape.click(); await until(() => shape.getAttribute("aria-pressed") === "true", 3000); await wait(200); shape.click();
    const strip = await until(() => document.querySelector('.strip[data-tool="shape"]'), 2000);
    const names = [...(strip?.querySelectorAll(".variant-name") ?? [])].map((x) => x.textContent);
    const none = !!strip && names.length > 20 && !names.includes("Pen") && !names.includes("Edit curve") && !strip.querySelector('[data-item="pen"], [data-item="pen-edit"]');
    await press({ key: "Escape", code: "Escape" });
    const pen = slot("Edit curve") ?? slot("Pen")!, r = pen.getBoundingClientRect(), p = [r.left + r.width / 2, r.top + r.height / 2];
    ev("pointerdown", p);
    const menu = await until(() => document.querySelector('.strip[data-tool="pen"]'), 3000);
    await wait(300);
    const items = [...(menu?.querySelectorAll<HTMLElement>(".variant") ?? [])].map((x) => [x.dataset.item, x.textContent?.trim(), x.getAttribute("role")].join(":"));
    const option = menu?.querySelector<HTMLElement>('[data-item="pen"]'), o = option?.getBoundingClientRect();
    if (o) { ev("pointermove", [o.left + 10, o.top + 10]); ev("pointerup", [o.left + 10, o.top + 10]); }
    await wait(500);
    const chose = !!slot("Pen") && slot("Pen")!.getAttribute("aria-pressed") === "true";
    result("T7", "The Shape menu has no Pen; the Pen menu has Pen and Edit curve; a press, hold, slide and release on the Pen slot picks one",
      none && items.join(" ") === "pen:Pen:menuitemradio pen-edit:Edit curve:menuitemradio" && menu?.getAttribute("aria-label") === "Edit curve options" && chose,
      `Shape menu without Pen ${none} (${names.length} options), Pen menu ${items.join(" ")} (${menu?.getAttribute("aria-label")}), chose Pen ${chose}`);
  });

  await step("T8", "The command palette has Pen and Edit curve with the tools", async () => {
    const open = async (text: string) => {
      key({ key: "a", code: "KeyA", metaKey: true, shiftKey: true });
      const find = await until(() => document.querySelector<HTMLInputElement>(".command-palette input"), 3000);
      if (!find) return "";
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(find, text);
      find.dispatchEvent(new Event("input", { bubbles: true }));
      await wait(500);
      const first = document.querySelector(".command-palette [aria-selected='true'], .command-palette .command.active, .command-palette li")?.textContent ?? "";
      find.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true, cancelable: true }));
      await wait(600);
      return first;
    };
    const e = await open("Edit curve"), edit = inHand() === "Edit curve";
    const p = await open("Pen"), pen = inHand() === "Pen";
    result("T8", "The command palette has Pen and Edit curve with the tools", edit && pen, `"Edit curve" → ${inHand() && edit ? "Edit curve" : "no"} (${e.slice(0, 40)}), "Pen" → ${pen} (${p.slice(0, 40)})`);
  });

  // A bond and a curve of three points, away from the other curves: the bond's first atom is where its click was, and
  // the curve stays picked after Return.
  const P = [cx - 320, cy - 220], Q = [[cx - 200, cy - 260], [cx - 140, cy - 300], [cx - 80, cy - 260]];
  const points = (id: string) => doc().arrows.find((a: any) => a.id === id).curve.points.length;
  const squares = () => document.querySelectorAll(".pen-points rect").length;
  const editing = async () => {
    pin("pen:pen-edit")!.click();
    await until(() => pin("pen:pen-edit")!.getAttribute("aria-pressed") === "true", 3000);
    if (!squares()) await click(Q[0]);
    return !!(await until(() => squares() > 0, 2000));
  };
  let curve = "";

  await step("T9", "Edit curve with a curve picked: a drag from an atom adds no point and draws nothing (as under Shape); a click there adds one", async () => {
    await press({ key: "x", code: "KeyX" });
    const atoms0 = doc().atoms.length;
    await click(P);
    const bond = doc().atoms.length === atoms0 + 2;
    pin("pen:pen")!.click();
    await until(() => pin("pen:pen")!.getAttribute("aria-pressed") === "true", 3000);
    for (const q of Q) await click(q);
    await press({ key: "Enter", code: "Enter" });
    curve = curves().at(-1).id;
    const shapes0 = (doc().shapes ?? []).length, picked = await editing(), n0 = points(curve);
    await drag(P, [P[0] - 60, P[1] + 60]);
    const none = points(curve) === n0 && (doc().shapes ?? []).length === shapes0 && doc().atoms.length === atoms0 + 2;
    const again = await editing();
    await click(P);
    const one = points(curve) === n0 + 1;
    result("T9", "Edit curve with a curve picked: a drag from an atom adds no point and draws nothing (as under Shape); a click there adds one",
      bond && n0 === 3 && picked && again && none && one, `bond drawn ${bond}, curve picked ${picked} ${again}, points ${n0} → after the drag ${none ? "the same" : "changed"} → after the click ${points(curve)}`);
  });

  await step("T10", "Edit curve with a curve picked: a still press on empty canvas gives Select; let go, it adds no point and Edit curve is back", async () => {
    const picked = await editing(), n0 = points(curve), q = [cx + 300, cy + 250];
    ev("pointermove", q, { buttons: 0 }); await wait(40); ev("pointerdown", q);
    const held = !!(await until(() => inHand() === "Select", 3000));
    ev("pointerup", q);
    const back = !!(await until(() => inHand() === "Edit curve", 3000));
    await wait(300);
    result("T10", "Edit curve with a curve picked: a still press on empty canvas gives Select; let go, it adds no point and Edit curve is back",
      picked && held && back && points(curve) === n0, `curve picked ${picked}, Select while held ${held}, Edit curve after ${back}, points ${n0} → ${points(curve)}`);
  });

  await step("T11", "The command palette's recent commands from 1.1.2 (Shape > Edit curve, Shape > Pen) are Edit curve and Pen, each once", async () => {
    localStorage.setItem("octet.recent", JSON.stringify(["shape:pen-edit", "pen:pen-edit", "shape:pen", "tool:text"]));
    key({ key: "a", code: "KeyA", metaKey: true, shiftKey: true });
    const find = await until(() => document.querySelector<HTMLInputElement>(".command-palette input"), 3000);
    await wait(300);
    const recent = [...document.querySelectorAll(".command-list .command")].filter((r) => r.querySelector(".command-group")?.textContent === "Recent").map((r) => r.querySelector(".command-name")?.textContent);
    find?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true }));
    await until(() => !document.querySelector(".command-palette"), 2000);
    result("T11", "The command palette's recent commands from 1.1.2 (Shape > Edit curve, Shape > Pen) are Edit curve and Pen, each once",
      recent.join(", ") === "Edit curve, Pen, Text", `Recent: ${recent.join(", ")}`);
  });

  await step("T12", "Settings > Keyboard shortcuts lists Pen tool, Edit curve tool and Measure tool after Bracket tool", async () => {
    (document.querySelector(".actions-reopen") as HTMLElement | null)?.click();
    await wait(400);
    (document.querySelector(".actions-settings") as HTMLElement | null)?.click();
    const keys = await until(() => [...document.querySelectorAll<HTMLElement>(".settings-window .module")].find((m) => m.textContent?.trim() === "Keyboard shortcuts"), 3000);
    keys?.click();
    await wait(600);
    const names = (document.querySelector<HTMLElement>(".settings-window")?.innerText ?? "").split("\n").map((l) => l.trim()).filter((l) => /^[A-Z][A-Za-z ]* tool$/.test(l));
    const b = names.indexOf("Bracket tool");
    (document.querySelector(".settings-window .actions-close") as HTMLElement | null)?.click();
    await wait(500);
    result("T12", "Settings > Keyboard shortcuts lists Pen tool, Edit curve tool and Measure tool after Bracket tool",
      b >= 0 && names[b + 1] === "Pen tool" && names[b + 2] === "Edit curve tool" && names[b + 3] === "Measure tool", names.slice(Math.max(0, b - 1), b + 5).join(", ") || `${names.length} tools listed`);
  });

  out.errors = ((window as any).__errors ?? []).slice(0, 10);
  return JSON.stringify(out);
}
