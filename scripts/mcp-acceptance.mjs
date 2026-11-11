// The MCP acceptance cases (docs/plans/mcp.md, section 6; E2): each job run start to finish against the real app, as
// an AI app runs it, with its checks. Run a dev build with OCTET_MCP=1 (the octet-mcp preview), then:
//   node scripts/mcp-acceptance.mjs            every case
//   node scripts/mcp-acceptance.mjs 2 3        those cases
// Each check prints PASS or FAIL with what it found. A failing check is work still to do; the script ends with 1 when
// any check fails. Case 7 (Export) runs last: its dialog stays open, and Octet runs no menu command over a dialog.
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, platform, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = platform() === "darwin" ? join(homedir(), "Library/Application Support") : platform() === "win32" ? process.env.APPDATA : process.env.XDG_DATA_HOME ?? join(homedir(), ".local/share");
// Octet may still be starting (a CI machine): up to a minute for its file and its server. A dev build keeps
// mcp-dev.json (mcp.json is the installed Octet's, which may run at the same time).
const read = () => { try { return JSON.parse(readFileSync(join(dir, "io.github.samchemman.octet-draw", "mcp-dev.json"), "utf8")); } catch { return undefined; } };
let info;
for (const end = Date.now() + 60_000; Date.now() < end; await new Promise((r) => setTimeout(r, 1000))) {
  info = read();
  if (info && (await fetch(`http://127.0.0.1:${info.port}/mcp`, { method: "POST" }).then(() => true, () => false))) break;
}
if (!info) throw new Error("Octet's mcp-dev.json is not there: start a dev build with OCTET_MCP=1.");
const { port, token } = info;
const URL_ = `http://127.0.0.1:${port}/mcp`;

// A client: one MCP session (initialize, then each call with its session id).
async function client(name) {
  let session, n = 0;
  const post = async (body) => {
    const r = await fetch(URL_, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-11-25", ...(session ? { "mcp-session-id": session } : {}) }, body: JSON.stringify(body) });
    session ??= r.headers.get("mcp-session-id") ?? undefined;
    const text = await r.text();
    return text ? JSON.parse(text) : undefined;
  };
  await post({ jsonrpc: "2.0", id: ++n, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name, version: "1" } } });
  await post({ jsonrpc: "2.0", method: "notifications/initialized" });
  const call = async (tool, args = {}) => {
    const t0 = Date.now(), r = await post({ jsonrpc: "2.0", id: ++n, method: "tools/call", params: { name: tool, arguments: args } });
    const res = r.result ?? { isError: true, content: [{ type: "text", text: JSON.stringify(r.error) }] };
    return { ...res, text: res.content?.[0]?.text ?? "", ms: Date.now() - t0 };
  };
  const read = async () => (await call("read", { detail: "full" })).structuredContent;
  const headers = () => ({ authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-11-25", "mcp-session-id": session });
  // Each server-sent event's message, as it comes: onEvent may return false to stop reading.
  const events = async (r, onEvent) => {
    const reader = r.body.getReader(), dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return;
      buf += dec.decode(value, { stream: true });
      let k;
      while ((k = buf.indexOf("\n\n")) >= 0) {
        const data = buf.slice(0, k).split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("");
        buf = buf.slice(k + 2);
        if (data && (await onEvent(JSON.parse(data))) === false) { await reader.cancel(); return; }
      }
    }
  };
  // A call with a progress token: its progress notifications, then its result.
  const streamed = async (tool, args, onProgress) => {
    const id = ++n, r = await fetch(URL_, { method: "POST", headers: headers(), body: JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name: tool, arguments: args, _meta: { progressToken: `t${id}` } } }) });
    let result;
    if (!r.headers.get("content-type")?.startsWith("text/event-stream")) return { type: r.headers.get("content-type"), reply: await r.json() };
    await events(r, async (m) => { if (m.method === "notifications/progress") await onProgress?.(m.params, id); else if (m.id === id) { result = m; return false; } });
    return { type: "text/event-stream", reply: result };
  };
  // The session's event stream (GET), for notifications such as resources/updated.
  const listen = async (onEvent) => { const c = new AbortController(), r = await fetch(URL_, { headers: { ...headers(), accept: "text/event-stream" }, signal: c.signal }); void events(r, onEvent).catch(() => {}); return () => c.abort(); };
  return { call, read, post, streamed, listen, get session() { return session; } };
}

// An AI app that starts a program and talks to it on standard input and output (the relay, or the bundle's server).
function stdio(command, args, env = {}) {
  const child = spawn(command, args, { stdio: ["pipe", "pipe", "inherit"], env: { ...process.env, ...env } });
  let n = 0, rest = "";
  const waiting = new Map(), notes = [], bad = [];
  child.stdout.on("data", (chunk) => {
    const lines = (rest + chunk).split("\n");
    rest = lines.pop();
    for (const line of lines.filter((l) => l.trim())) {
      let m;
      try { m = JSON.parse(line); } catch { bad.push(line.slice(0, 80)); continue; }
      if (m.method) notes.push(m);
      else if (waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); }
    }
  });
  // A program that ends answers nothing more: each call waiting gets an error.
  child.on("exit", (code) => { for (const done of waiting.values()) done({ error: { message: `the program ended (${code})` } }); waiting.clear(); });
  const send = (m) => child.stdin.write(JSON.stringify(m) + "\n");
  const ask = (method, params, onSent) => new Promise((done) => { const id = ++n; waiting.set(id, done); send({ jsonrpc: "2.0", id, method, params }); onSent?.(id); });
  return { ask, send, notes, bad, stop: () => child.kill() };
}
const until = async (ok, ms) => { const end = Date.now() + ms; while (!ok() && Date.now() < end) await new Promise((r) => setTimeout(r, 100)); return ok(); };

let failed = 0;
const check = (ok, what, found = "") => { if (!ok) failed++; console.log(`  ${ok ? "PASS" : "FAIL"} ${what}${!ok && found ? `: ${found}` : ""}`); return ok; };
const inside = (b, page) => b && b[0] >= page[0] - 1e-6 && b[1] >= page[1] - 1e-6 && b[2] <= page[2] + 1e-6 && b[3] <= page[3] + 1e-6;
const meets = (p, q) => p && q && p[0] < q[2] - 0.05 && q[0] < p[2] - 0.05 && p[1] < q[3] - 0.05 && q[1] < p[3] - 0.05;
// Every box in a reading: structures, captions and straight arrows, with a name for each.
const boxes = (d) => [
  ...d.structures.map((s) => [s.id, s.box]),
  ...(d.captions ?? []).filter((c) => c.box).map((c) => [`${c.id} "${c.text}"`, c.box, c.of]),
  ...(d.reagentTables ?? []).filter((t) => t.box).map((t) => [`the reagent table of ${t.arrow}`, t.box, t.arrow]),
  ...d.arrows.filter((a) => !["curved", "fishhook", "arc", "line"].includes(a.kind)).map((a) => [a.id, [Math.min(a.from[0], a.to[0]), Math.min(a.from[1], a.to[1]) - 0.05, Math.max(a.from[0], a.to[0]), Math.max(a.from[1], a.to[1]) + 0.05]]),
];
// Two things that overlap, leaving out text and what it belongs to (a number under its structure, text on its arrow).
const overlaps = (d) => { const b = boxes(d), out = []; b.forEach(([p, x, ofP], k) => b.slice(k + 1).forEach(([q, y, ofQ]) => { const pid = p.split(" ")[0], qid = q.split(" ")[0]; if (ofP !== qid && ofQ !== pid && meets(x, y)) out.push(`${p} / ${q}`); })); return out; };
const offPage = (d) => boxes(d).filter(([, b]) => b && !inside(b, d.pageBox)).map(([p]) => p);
const layout = (d, what) => { const o = overlaps(d), off = offPage(d); check(!o.length, `${what}: nothing overlaps`, o.slice(0, 6).join("; ")); check(!off.length, `${what}: everything is on the page`, off.slice(0, 6).join(", ")); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const SCHEME = { start: [{ text: "benzaldehyde", number: "1" }], steps: [
  { above: ["MeNO2, NH4OAc", "AcOH, reflux, 4 h"], below: ["78%"], products: [{ text: "[O-][N+](=O)/C=C/c1ccccc1", number: "2" }] },
  { above: ["LiAlH4", "THF, 0 °C to reflux"], below: ["85%"], products: [{ text: "2-phenylethylamine", number: "3" }] },
  { above: ["Ac2O, Et3N", "CH2Cl2, rt"], below: ["92%"], products: [{ text: "N-(2-phenylethyl)acetamide", number: "4" }] },
] };

const CASES = {
  async 1(a) {
    console.log("1. Compound 5 with a carbon of six bonds: warned, then fixed");
    const made = await a.call("drawings", { action: "new", for: "paper" });
    check(!made.isError && made.structuredContent?.opened, "drawings new gives the drawing", made.text);
    const r = await a.call("draw", { kind: "structures", structures: [{ text: "OC(=O)C(C)(C)(C)(C)c1ccccc1", number: "5" }] });
    check(r.structuredContent?.warnings?.some((w) => /6 bonds/.test(w)), "the result names the warning", r.text);
    let d = await a.read();
    check(d.experiment === undefined && !(d.reagentTables ?? []).length, "a paper drawing is not an experiment page", JSON.stringify(d.experiment));
    check(d.warnings.length === 1 && d.warnings[0].structure === d.structures[0].id, "read gives the warning on the structure", JSON.stringify(d.warnings));
    check(new RegExp(`^${d.structures[0].id}\\.\\d+$`).test(d.warnings[0]?.atom ?? ""), "and on its atom, by the atom's id", d.warnings[0]?.atom);
    const fix = await a.call("change", { operations: [{ op: "replace", structure: "5", text: "2-methyl-2-phenylpropanoic acid" }] });
    check(!fix.isError, "replace takes the compound number as the id", fix.text);
    d = await a.read();
    check(d.warnings.length === 0 && d.structures[0]?.formula === "C10H12O2" && d.structures[0].number === "5", "fixed, still compound 5", JSON.stringify(d.structures.map((s) => [s.formula, s.number])));
  },
  async 2(a) {
    console.log("2. The three-step nitrostyrene scheme");
    const r = await a.call("draw", { kind: "reaction", ...SCHEME });
    check(!r.isError, "drawn", r.text);
    const d = await a.read(), again = await a.read();
    const scheme = d.reactions.find((x) => x.steps.length === 3);
    check(!!scheme, "one reaction of three steps", JSON.stringify(d.reactions.map((x) => x.steps.length)));
    check(scheme && same(scheme.steps.map((s) => s.above), [["MeNO2, NH4OAc", "AcOH, reflux, 4 h"], ["LiAlH4", "THF, 0 °C to reflux"], ["Ac2O, Et3N", "CH2Cl2, rt"]]), "conditions in the order given", JSON.stringify(scheme?.steps.map((s) => s.above)));
    check(same(d, again), "two reads agree");
    layout(d, "the scheme");
  },
  async 3(a) {
    console.log("3. The esterification below it: the clash of numbers warned, then renumbered");
    await a.call("draw", { kind: "reaction", start: [{ text: "acetic acid" }, { text: "ethanol" }], steps: [{ above: ["H2SO4 (cat.)"], below: ["reflux"], products: [{ text: "ethyl acetate", number: "1" }, { text: "water" }] }] });
    let d = await a.read();
    check(d.warnings.some((w) => /number 1 is on more than one/.test(w.message)), "the clash is a warning", JSON.stringify(d.warnings));
    const ester = d.structures.find((s) => s.formula === "C4H8O2");
    const re = await a.call("change", { operations: [{ op: "number", structure: ester?.id ?? "?", number: "6" }] });
    check(!re.isError, "renumbered", re.text);
    d = await a.read();
    check(!d.warnings.length, "no warnings now", JSON.stringify(d.warnings));
    layout(d, "both reactions");
  },
  async 4(a) {
    console.log("4. Delete the esterification: nothing of it left");
    let d = await a.read();
    const r = d.reactions.find((x) => x.products.some((p) => d.structures.find((s) => s.id === p)?.number === "6"));
    const ids = r ? [...r.steps.flatMap((s) => [s.arrow, ...s.before]), ...r.products] : [];
    const del = await a.call("change", { operations: [{ op: "delete", ids }] });
    check(!del.isError, "deleted", del.text);
    d = await a.read();
    check(!d.captions.some((c) => ["+", "H2SO4 (cat.)", "reflux", "6"].includes(c.text.trim())), "no plus signs, conditions or number left", JSON.stringify(d.captions.map((c) => c.text)));
    check(!d.structures.some((s) => ["C2H4O2", "C2H6O", "C4H8O2", "H2O"].includes(s.formula)), "no structures of it left");
  },
  async 5(a) {
    console.log("5. The ethyl acetate experiment page");
    const made = await a.call("drawings", { action: "new", for: "experiment" });
    check(!made.isError, "new experiment page", made.text);
    await a.call("draw", { kind: "reaction", start: [{ text: "acetic acid" }, { text: "ethanol" }], steps: [{ above: ["H2SO4"], below: ["reflux, 4 h", "90%"], products: [{ text: "ethyl acetate" }] }] });
    const f = await a.call("advanced", { tool: "fill_experiment", args: { details: { title: "Ethyl acetate", date: "4 November 2026", notebook: "SE-112" }, amounts: [{ of: "acetic acid", mass: "6.0 g", limiting: true }, { of: "ethanol", moles: "300 mmol" }, { of: "H2SO4", volume: "0.1 mL" }, { of: "ethyl acetate", measured: "7.9 g" }] } });
    check(!f.isError && !/cannot read|no column/.test(f.text), "every amount taken, H2SO4 included", f.text);
    const p = await a.call("change", { operations: [{ op: "text", text: "Acetic acid (6.0 g, 100 mmol) and ethanol (13.8 g, 300 mmol) were heated at reflux with conc. H2SO4 (0.1 mL) for 4 h. Distillation gave ethyl acetate (7.9 g, 90%)." }] });
    check(!p.isError, "procedure added", p.text);
    const d = await a.read();
    check(d.experiment?.title === "Ethyl acetate", "details set", JSON.stringify(d.experiment));
    const cols = d.reagentTables?.[0]?.columns ?? [], col = (key) => cols.find((c) => c.key === key);
    check(col("r:C2H4O2")?.typed.mass === 6 && col('r:"H2SO4"')?.typed.volume === 0.1, "amounts kept as typed", JSON.stringify(cols.map((c) => [c.key, c.typed])));
    check(col('r:"H2SO4"')?.formula === "H2SO4" && Math.abs(col('r:"H2SO4"').mw - 98.07) < 0.01, "H2SO4 has its column, with its formula", JSON.stringify(cols.map((c) => [c.key, c.formula, c.mw])));
    check(Array.isArray(d.reagentTables?.[0]?.box), "read gives the reagent table's box");
    layout(d, "the page");
  },
  async 6(a) {
    console.log("6. ACS2: the page laid out again");
    const s = await a.call("advanced", { tool: "set_style", args: { page: "ACS2" } });
    check(!s.isError, "set_style", s.text);
    const d = await a.read();
    check(d.page === "ACS2", "the page is ACS2");
    layout(d, "on ACS2");
  },
  async 8(a) {
    console.log("8. A Suzuki cycle: step names clear of each other and of the structures");
    await a.call("drawings", { action: "new", for: "paper" });
    const r = await a.call("draw", { kind: "cycle", intermediates: [{ text: "[Pd]" }, { text: "Br[Pd]c1ccccc1" }, { text: "c1ccc(cc1)[Pd]c1ccccc1" }], centre: "Pd(PPh3)4", steps: [{ step: 0, in: "PhBr", name: "oxidative addition" }, { step: 1, in: "PhB(OH)2, base", out: "BrB(OH)2", name: "transmetalation" }, { step: 2, out: "Ph–Ph", name: "reductive elimination" }] });
    check(!r.isError, "drawn", r.text);
    let d = await a.read();
    layout(d, "the cycle");
    // A cycle's id is the whole cycle: moved, its intermediates go with it; deleted, nothing of it is left.
    const c = d.cycles[0]?.id, before = d.structures.map((s) => s.box[0]);
    await a.call("change", { operations: [{ op: "move", ids: [c], dx: 2, dy: 0 }] });
    d = await a.read();
    check(d.structures.every((s, k) => Math.abs(s.box[0] - before[k] - 2) < 0.05), "moving the cycle moves its intermediates", JSON.stringify(d.structures.map((s) => s.box[0])));
    await a.call("change", { operations: [{ op: "delete", ids: [c] }] });
    d = await a.read();
    check(!d.cycles.length && !d.structures.length && !d.captions.length, "deleting the cycle leaves nothing of it", `${d.structures.length} structures, ${d.captions.length} captions`);
  },
  async 9() {
    console.log("9. Two sessions in two drawings, with a third window brought to the front");
    const [p, q] = [await client("acceptance-p"), await client("acceptance-q")];
    const other = { post: (body) => fetch(URL_, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body) }) };
    // At the same time: each new drawing goes to the window it opened, not to the other's.
    const [dp, dq] = (await Promise.all([p, q].map((x) => x.call("drawings", { action: "new", for: "paper" })))).map((r) => r.structuredContent?.opened);
    check(dp && dq && dp !== dq, "each session has its own new drawing, opened at the same time", `${dp} ${dq}`);
    // A request with no session acts on the window in front, and drawings with use then brings that window to the front.
    await other.post({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "drawings", arguments: { action: "use", drawing: "main" } } });
    await p.call("draw", { kind: "structures", structures: [{ text: "benzene" }] });
    await q.call("draw", { kind: "structures", structures: [{ text: "water" }] });
    const [rp, rq] = [await p.read(), await q.read()];
    check(rp.drawing.id === dp && same(rp.structures.map((s) => s.formula), ["C6H6"]), "session p drew in its drawing", JSON.stringify([rp.drawing.id, rp.structures.map((s) => s.formula)]));
    check(rq.drawing.id === dq && same(rq.structures.map((s) => s.formula), ["H2O"]), "session q drew in its drawing", JSON.stringify([rq.drawing.id, rq.structures.map((s) => s.formula)]));
  },
  async 10(a) {
    console.log("10. A grid of 200 structures");
    await a.call("drawings", { action: "new", for: "paper" });
    const names = ["benzene", "toluene", "phenol", "aniline", "pyridine", "furan", "thiophene", "naphthalene", "ethanol", "acetone"];
    const r = await a.call("draw", { kind: "structures", structures: Array.from({ length: 200 }, (_, k) => ({ text: names[k % names.length], number: `S${k + 1}` })) });
    check(!r.isError, "drawn", r.text.slice(0, 200));
    check(r.ms < 10_000, "under 10 s", `${r.ms} ms`);
    // With a progress token: progress as it goes, then the result, on one event stream.
    await a.call("drawings", { action: "new", for: "paper" });
    const big = { structures: Array.from({ length: 60 }, (_, k) => ({ text: names[k % names.length] })) }, notes = [];
    let s = await a.streamed("draw", { kind: "structures", ...big }, (p) => { notes.push(p); });
    check(s.type === "text/event-stream" && s.reply?.result && !s.reply.result.isError, "answered on an event stream", JSON.stringify(s.reply).slice(0, 200));
    check(notes.length >= 5 && notes.every((p, k) => p.total === 60 && (!k || p.progress > notes[k - 1].progress)), "progress for each ten structures", JSON.stringify(notes.slice(0, 3)));
    // notifications/cancelled after the first progress: the call stops and the drawing is as it was.
    const before = (await a.read()).structures.length;
    s = await a.streamed("draw", { kind: "structures", structures: Array.from({ length: 200 }, (_, k) => ({ text: names[k % names.length] })) }, async (p, id) => { if (p.progress === 10) await a.post({ jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: id, reason: "test" } }); });
    check(s.reply?.result?.isError && /was cancelled/.test(s.reply.result.content[0].text), "cancel stops the call", JSON.stringify(s.reply).slice(0, 200));
    const after = (await a.read()).structures.length;
    check(after === before, "and leaves the drawing as it was", `${before} then ${after}`);
  },
  async 17(a) {
    console.log("17. Prompts, drawing resources and a subscription");
    const d = (await a.call("drawings", { action: "new", for: "paper" })).structuredContent?.opened;
    const init = await a.post({ jsonrpc: "2.0", id: 900, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "acceptance", version: "1" } } });
    check(init.result?.capabilities?.resources?.subscribe && init.result.capabilities.prompts, "Octet offers resources and prompts", JSON.stringify(init.result?.capabilities));
    const prompts = (await a.post({ jsonrpc: "2.0", id: 901, method: "prompts/list" })).result?.prompts ?? [];
    check(prompts.length === 5, "five prompts", prompts.map((p) => p.name).join(", "));
    const got = await a.post({ jsonrpc: "2.0", id: 902, method: "prompts/get", params: { name: "draw_scheme", arguments: { text: "Benzaldehyde was reduced." } } });
    check(/Benzaldehyde was reduced/.test(got.result?.messages?.[0]?.content?.text ?? ""), "a prompt with its argument", JSON.stringify(got).slice(0, 200));
    const list = (await a.post({ jsonrpc: "2.0", id: 903, method: "resources/list" })).result?.resources?.map((r) => r.uri) ?? [];
    check(list.includes("octet://drawings") && list.includes(`octet://drawing/${d}`), "the new drawing is a resource", list.join(", "));
    await a.call("draw", { kind: "structures", structures: [{ text: "benzene" }] });
    const json = await a.post({ jsonrpc: "2.0", id: 904, method: "resources/read", params: { uri: `octet://drawing/${d}` } });
    check(JSON.parse(json.result?.contents?.[0]?.text ?? "{}").structures?.[0]?.formula === "C6H6", "read as JSON", JSON.stringify(json).slice(0, 200));
    const cdxml = await a.post({ jsonrpc: "2.0", id: 905, method: "resources/read", params: { uri: `octet://drawing/${d}/cdxml` } });
    check(/<CDXML/.test(cdxml.result?.contents?.[0]?.text ?? ""), "read as CDXML", JSON.stringify(cdxml).slice(0, 200));
    const png = await a.post({ jsonrpc: "2.0", id: 906, method: "resources/read", params: { uri: `octet://drawing/${d}/png` } });
    check((png.result?.contents?.[0]?.blob ?? "").startsWith("iVBOR"), "read as a picture", JSON.stringify(png).slice(0, 120));
    const none = await a.post({ jsonrpc: "2.0", id: 907, method: "resources/read", params: { uri: "octet://drawing/draw-999" } });
    check(none.error?.code === -32002, "an unknown drawing is not found", JSON.stringify(none));
    // Subscribed: a change to the drawing sends resources/updated on the session's event stream.
    const updated = [], stop = await a.listen((m) => { if (m.method === "notifications/resources/updated") updated.push(m.params.uri); });
    await a.post({ jsonrpc: "2.0", id: 908, method: "resources/subscribe", params: { uri: `octet://drawing/${d}` } });
    await a.call("draw", { kind: "structures", structures: [{ text: "water" }] });
    await new Promise((r) => setTimeout(r, 1500));
    stop();
    check(updated.includes(`octet://drawing/${d}`), "a subscribed drawing tells the app it changed", JSON.stringify(updated));
  },
  async 18() {
    console.log("18. Through the relay (Octet Draw --mcp) and Claude Desktop's bundle");
    const r = stdio(info.program, ["--mcp"]);
    const init = await r.ask("initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "acceptance-relay", version: "1" } });
    check(init.result?.serverInfo?.name === "octet-draw" && init.result.instructions?.includes("draw with kind reaction"), "Octet answers initialize", JSON.stringify(init).slice(0, 200));
    r.send({ jsonrpc: "2.0", method: "notifications/initialized" });
    const tools = (await r.ask("tools/list")).result?.tools ?? [];
    check(tools.length === 5 && JSON.stringify(tools).length < 14000, "the five tools, under 14,000 characters", `${tools.length}, ${JSON.stringify(tools).length}`);
    const d = (await r.ask("tools/call", { name: "drawings", arguments: { action: "new", for: "paper" } })).result?.structuredContent?.opened;
    const names = ["benzene", "toluene", "phenol", "aniline", "pyridine", "furan", "thiophene", "naphthalene", "ethanol", "acetone"];
    const some = (k) => ({ structures: Array.from({ length: k }, (_, i) => ({ text: names[i % names.length] })) });
    let res = await r.ask("tools/call", { name: "draw", arguments: { kind: "structures", ...some(60) }, _meta: { progressToken: "p" } });
    const progress = r.notes.filter((m) => m.method === "notifications/progress" && m.params.progressToken === "p");
    check(!res.result?.isError && progress.length >= 5, "progress, then the result", `${progress.length} progress; ${JSON.stringify(res).slice(0, 120)}`);
    res = await r.ask("tools/call", { name: "draw", arguments: { kind: "structures", ...some(200) }, _meta: { progressToken: "q" } }, (id) => {
      const wait = setInterval(() => { if (r.notes.some((m) => m.params?.progressToken === "q")) { clearInterval(wait); r.send({ jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: id } }); } }, 5);
    });
    check(/was cancelled/.test(res.result?.content?.[0]?.text ?? ""), "a cancel goes through while the call runs", JSON.stringify(res).slice(0, 160));
    await r.ask("resources/subscribe", { uri: `octet://drawing/${d}` });
    await r.ask("tools/call", { name: "draw", arguments: { kind: "structures", ...some(1) } });
    check(await until(() => r.notes.some((m) => m.method === "notifications/resources/updated" && m.params.uri === `octet://drawing/${d}`), 4000), "a drawing's update comes through", JSON.stringify(r.notes.filter((m) => !m.params?.progressToken)).slice(0, 200));
    check(!r.bad.length, "only MCP messages on standard output", r.bad.join(" | "));
    r.stop();
    // Octet not there yet: the relay answers itself, then the tools appear once Octet is.
    const home = mkdtempSync(join(tmpdir(), "octet-relay-")), mine = platform() === "darwin" ? join(home, "Library/Application Support") : platform() === "win32" ? join(home, "AppData") : join(home, "share");
    const there = { HOME: home, APPDATA: mine, XDG_DATA_HOME: mine };
    const c = stdio(info.program, ["--mcp"], there);
    const early = await c.ask("initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "acceptance-early", version: "1" } });
    const none = (await c.ask("tools/list")).result?.tools;
    check(early.result?.capabilities?.tools?.listChanged === true && Array.isArray(none) && !none.length, "before Octet: initialize answered, no tools yet", JSON.stringify(early).slice(0, 200));
    mkdirSync(join(mine, "io.github.samchemman.octet-draw"), { recursive: true });
    writeFileSync(join(mine, "io.github.samchemman.octet-draw", "mcp-dev.json"), JSON.stringify(info));
    const changed = await until(() => c.notes.some((m) => m.method === "notifications/tools/list_changed"), 6000);
    const later = (await c.ask("tools/list")).result?.tools ?? [];
    check(changed && later.length >= 20, "Octet found: the list changed and the tools are there", `${changed} ${later.length}`);
    c.stop();
    // Claude Desktop's bundle runs mcpb.cjs, which starts the same relay. A dev build's bundle has mcp-dev.json in
    // place of mcp.json (bundle in mcp.rs). It runs in the real home, so the folder it works out must be the folder
    // Octet wrote to.
    const server = join(home, "index.cjs");
    writeFileSync(server, readFileSync(fileURLToPath(new URL("../src-tauri/src/mcpb.cjs", import.meta.url)), "utf8").replaceAll("mcp.json", "mcp-dev.json"));
    const b = stdio(process.execPath, [server]);
    await b.ask("initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "acceptance-bundle", version: "1" } });
    const read = await b.ask("tools/call", { name: "drawings", arguments: { action: "list" } });
    check(!read.result?.isError && read.result?.structuredContent, "the bundle's server reaches Octet", JSON.stringify(read).slice(0, 160));
    b.stop();
    rmSync(home, { recursive: true, force: true });
  },
  async 11(a) {
    console.log("11. Align and space evenly (Octet's Object > Align and Distribute)");
    await a.call("drawings", { action: "new", for: "paper" });
    await a.call("draw", { kind: "structures", structures: [{ text: "benzene", number: "1" }, { text: "naphthalene", number: "2" }, { text: "pyridine", number: "3" }] });
    await a.call("change", { operations: [{ op: "move", ids: ["2"], dx: 0, dy: -2 }] });
    let r = await a.call("change", { operations: [{ op: "arrange", ids: ["1", "2", "3"], how: "top" }] });
    check(!r.isError, "align top", r.text);
    let d = await a.read(), tops = d.structures.map((s) => s.box[3]);
    check(Math.max(...tops) - Math.min(...tops) < 0.05, "their tops line up", JSON.stringify(tops));
    r = await a.call("change", { operations: [{ op: "arrange", ids: ["1", "2", "3"], how: "across" }] });
    d = await a.read();
    const b = d.structures.map((s) => s.box).sort((p, q) => p[0] - q[0]), gaps = [b[1][0] - b[0][2], b[2][0] - b[1][2]];
    check(!r.isError && Math.abs(gaps[0] - gaps[1]) < 0.05, "spaced evenly across", JSON.stringify(gaps));
  },
  async 12(a) {
    console.log("12. Conditions as data, read back as fields with formulas");
    await a.call("drawings", { action: "new", for: "paper" });
    const r = await a.call("draw", { kind: "reaction", start: [{ text: "benzaldehyde" }], steps: [{ reagents: ["MeNO2", "NH4OAc"], solvents: ["AcOH"], temperature: "reflux", time: "4 h", yield: "78%", products: [{ text: "[O-][N+](=O)/C=C/c1ccccc1", number: "2" }] }] });
    check(!r.isError, "drawn", r.text);
    const f = (await a.read()).reactions[0]?.steps[0]?.fields ?? {};
    check(JSON.stringify(f.reagents?.map((x) => [x.text, x.formula, x.resolved])) === JSON.stringify([["MeNO2", "MeNO2", true], ["NH4OAc", "NH4OAc", true]]), "reagents with their formulas", JSON.stringify(f.reagents));
    check(f.solvents?.[0]?.text === "AcOH" && f.temperature === "reflux" && f.time === "4 h" && f.yield === "78%", "solvent, temperature, time and yield", JSON.stringify(f));
  },
  async 13(a) {
    console.log("13. The drawing as CDXML text, InChI and source in the reading");
    const c = await a.call("read", { format: "cdxml" });
    check(!c.isError && /<CDXML[\s>]/.test(c.structuredContent?.text ?? ""), "CDXML text", c.text.slice(0, 120));
    const d = await a.read();
    check(d.structures.every((s) => /^InChI=1S\//.test(s.inchi ?? "") && /^[A-Z]{14}-[A-Z]{10}-[A-Z]$/.test(s.inchiKey ?? "")), "every structure has its InChI and InChIKey", JSON.stringify(d.structures.map((s) => s.inchiKey)));
    check(d.structures.some((s) => s.source?.given === "benzaldehyde" && s.source.named), "the source of what was drawn", JSON.stringify(d.structures.map((s) => s.source)));
  },
  async 14(a) {
    console.log("14. The same calls on a new drawing give the same drawing");
    const once = async () => {
      await a.call("drawings", { action: "new", for: "paper" });
      await a.call("draw", { kind: "reaction", ...SCHEME });
      const d = await a.read(), c = (await a.call("read", { format: "cdxml" })).structuredContent?.text ?? "";
      return { d: JSON.stringify({ ...d, drawing: undefined }), c: c.replace(/CreationDate="[^"]*"|ModificationDate="[^"]*"/g, "") };
    };
    const [p, q] = [await once(), await once()];
    check(p.d === q.d, "the same reading, ids included");
    check(p.c === q.c, "the same CDXML");
  },
  async 15(a) {
    console.log("15. The scheme first on an empty A4 page: on the page");
    await a.call("drawings", { action: "new", for: "paper" });
    await a.call("draw", { kind: "reaction", ...SCHEME });
    layout(await a.read(), "the scheme alone");
  },
  async 16(a) {
    console.log("16. A mechanism: a charge set, curly arrows from a lone pair and a bond, brackets with a mark");
    await a.call("drawings", { action: "new", for: "paper" });
    await a.call("draw", { kind: "structures", structures: [{ text: "[OH-]" }, { text: "CBr" }] });
    const full = async () => (await a.call("read", { atoms: true, detail: "full" })).structuredContent;
    let d = await full();
    const [oh, mebr] = d.structures, o = oh.atoms.find((x) => x.label === "O"), c = mebr.atoms.find((x) => x.label === "C"), cbr = mebr.bonds[0];
    check(o?.charge === -1, "hydroxide drawn with its charge", JSON.stringify(oh.atoms));
    let r = await a.call("change", { operations: [{ op: "edit", ids: [o.id], lone_pairs: 3 }] });
    check(!r.isError, "lone pairs set", r.text);
    r = await a.call("change", { operations: [{ op: "arrow", kind: "curved", from: `${o.id}:pair`, to: c.id }] });
    check(!r.isError, "curved arrow from the lone pair to the carbon", r.text);
    r = await a.call("change", { operations: [{ op: "arrow", kind: "curved", from: cbr.id, to: mebr.atoms.find((x) => x.label === "Br").id, bend: -0.4 }] });
    check(!r.isError, "curved arrow from the C–Br bond to Br", r.text);
    r = await a.call("change", { operations: [{ op: "edit", ids: [cbr.id], bond: "dashed" }] });
    check(!r.isError, "the breaking bond dashed", r.text);
    r = await a.call("change", { operations: [{ op: "shape", kind: "brackets", around: [mebr.id], mark: "‡" }] });
    check(!r.isError, "brackets with ‡", r.text);
    d = await full();
    check(d.arrows.filter((x) => x.kind === "curved").length === 2 && d.shapes?.[0]?.mark === "‡", "read back: two curved arrows and the bracket", JSON.stringify([d.arrows, d.shapes]));
    check(d.structures[1].bonds[0].kind === "dashed", "read back: the dashed bond", JSON.stringify(d.structures[1].bonds));
    // A straight arrow between two structures runs edge to edge (the headless session's case).
    await a.call("drawings", { action: "new", for: "paper" });
    await a.call("draw", { kind: "structures", structures: [{ text: "acetone" }, { text: "benzene" }] });
    const two = await a.read();
    r = await a.call("change", { operations: [{ op: "arrow", kind: "reaction", from: two.structures[0].id, to: two.structures[1].id }] });
    check(!r.isError && !/overlaps/.test(r.text), "a reaction arrow between two structures, clear of both", r.text);
    layout(await a.read(), "the arrow between them");
  },
  async 19(a) {
    console.log("19. Speed: a batch with references, placement, boxes and a cropped picture (plan section 19)");
    await a.call("drawings", { action: "new", for: "paper" });
    const png = (r) => r.content?.find((x) => x.type === "image")?.data.length ?? 0;
    let r = await a.call("change", { operations: [
      { op: "draw", kind: "structures", structures: [{ text: "benzene", number: "1" }] },
      { op: "draw", kind: "structures", structures: [{ text: "toluene", number: "2" }], right_of: "$1.s[0]", gap: 2 },
      { op: "text", runs: [{ text: "Figure 1. ", bold: true }, { text: "Two arenes" }], below: "$1.s", align: "left" },
      { op: "shape", kind: "rounded", around: ["$1.s[0]", "$2.s[0]", "$3.t[0]"], fill: "solid", colour: "#EEF2F8" },
    ], picture: true, detail: "full" });
    check(!r.isError, "the batch draws", r.text);
    check(r.ms < 2000, "in under 2 s", `${r.ms} ms`);
    const sc = r.structuredContent, [s1, s2] = sc.steps.slice(0, 2).map((x) => x.s[0]);
    let d = await a.read();
    const box = (id) => d.structures.find((x) => x.id === id)?.box ?? d.captions.find((x) => x.id === id)?.box;
    check(Math.abs(sc.boxes[s1][2] + 2 - sc.boxes[s2][0]) < 0.05, "step 2 sits 2 bond lengths right of step 1, with its number", JSON.stringify([sc.boxes[s1], sc.boxes[s2]]));
    check(same(sc.boxes[s2].map((v) => Math.round(v)), box(s2) && sc.boxes[s2].map((v) => Math.round(v))), "the result's boxes are read's", JSON.stringify([sc.boxes[s2], box(s2)]));
    const caption = d.captions.find((c) => c.id === sc.steps[2].t[0]);
    check(caption?.runs?.length === 2 && caption.runs[0].bold, "the caption keeps its runs", JSON.stringify(caption));
    layout(d, "the batch");
    // A PNG's long side, from its header.
    const side = (res) => { const b = Buffer.from(res.content?.find((x) => x.type === "image")?.data ?? "", "base64"); return b.length > 24 ? Math.max(b.readUInt32BE(16), b.readUInt32BE(20)) : 0; };
    check(side(r) > 0 && side(r) <= 800, "a write result's picture is at most 800 px", side(r));
    const one = await a.call("read", { ids: [s1], picture: true }), whole = await a.call("read", { picture: true, picture_size: "small" });
    check(png(one) > 0 && png(one) < png(r), "a picture of one id is smaller than the batch's", `${png(one)} / ${png(r)}`);
    check(side(whole) <= 600, "picture_size small is at most 600 px", side(whole));
    // One undo step takes away the whole batch.
    await a.call("advanced", { tool: "run_command", args: { command: "undo" } });
    d = await a.read();
    check(d.structures.length === 0 && !(d.shapes ?? []).length, "one Undo takes away the whole batch", JSON.stringify(d.structures.map((x) => x.id)));
    // A failing step leaves the drawing as it was, and names the step.
    await a.call("draw", { kind: "structures", structures: [{ text: "phenol" }] });
    const before = await a.read();
    r = await a.call("change", { operations: [{ op: "draw", kind: "structures", structures: [{ text: "water" }] }, { op: "move", ids: ["s999"], dx: 1, dy: 0 }] });
    check(r.isError && /Step 2 \(move\) failed/.test(r.text), "a failing step is named", r.text);
    d = await a.read();
    check(same(d.structures.map((x) => x.id), before.structures.map((x) => x.id)), "and the drawing is as it was", JSON.stringify(d.structures.map((x) => x.id)));
    // An arrow between two points (a dividing line).
    r = await a.call("change", { operations: [{ op: "arrow", kind: "line", from: [-10, -12], to: [10, -12] }] });
    check(!r.isError, "an arrow takes two points", r.text);
  },
  async 20(a) {
    console.log("20. A figure: a two-panel figure like Elliot's, in one call");
    await a.call("drawings", { action: "new", for: "paper" });
    const M = (x, y) => ({ label: "M", x, y, colour: "#6B35B8" });
    const s1 = { atoms: [M(0, 0), { label: "O", x: 1, y: 0.6 }, { label: "Si(OtBu)2", x: 1.9, y: 0 }, { label: "O", x: 1, y: -0.6 }, { label: "OSi", x: -1.2, y: 0.8 }, { label: "OSi", x: -1.4, y: -0.1 }, { label: "OSi", x: -1.1, y: -1 }],
      bonds: [{ from: 0, to: 1 }, { from: 1, to: 2 }, { from: 2, to: 3 }, { from: 3, to: 0 }, { from: 0, to: 4, kind: "hashwedge" }, { from: 0, to: 5, kind: "wedge" }, { from: 0, to: 6, kind: "hashwedge" }] };
    const s2 = { atoms: [M(0, 0), { label: "OSiPh3", x: 0, y: 1.2 }, { label: "OSiPh3", x: 0, y: -1.2 }, { label: "OSiPh3", x: 1.1, y: 0.4 }, { label: "OSiPh3", x: 1.1, y: -0.4 }, { label: "MeCN", x: -1.1, y: 0.4 }, { label: "MeCN", x: -1.1, y: -0.4 }],
      bonds: [{ from: 0, to: 1 }, { from: 0, to: 2 }, { from: 0, to: 3, kind: "hashwedge" }, { from: 0, to: 4, kind: "wedge" }, { from: 0, to: 5, kind: "hashwedge" }, { from: 0, to: 6, kind: "wedge" }] };
    const r = await a.call("draw", { kind: "figure", panels: [
      { title: "A  Siloxides", subtitle: "Mazzanti et al.", frame: "fill", fill: "#EEF2F8", rows: [[
        { molecule: s1, number: "S-1", caption: [{ text: "M = " }, { text: "Ce, Tb, Pr", colour: "#6B35B8" }] },
        { molecule: s2, number: "S-2", caption: "M = Ce, Pr, Tb" },
        { structure: "[Ce]", number: "S-3", caption: "M = Ce, Tb" },
      ]] },
      { title: "B  Imidophosphoranes", subtitle: "La Pierre et al.", frame: "fill", fill: "#EEF2F8", rows: [[
        { structure: "*N=P(N(C)C)(N(C)C)N(C)C", labels: ["M"], number: "I-1", brackets: "brackets" },
        { text: "when M = Ce, Pr\nR3 = tBu3" },
        { structure: "CCN(CC)P(=N[Tb])(N(CC)CC)N(CC)CC", number: "I-2", brackets: "brackets", mark: "n" },
      ]] },
    ], colour_by_element: true, picture: true, detail: "full" });
    check(!r.isError, "draw draws the figure", r.text);
    check(r.ms < 3000, "in under 3 s", `${r.ms} ms`);
    const fig = r.structuredContent?.figure, d = await a.read();
    const frames = (fig ?? []).map((p) => d.shapes?.find((x) => x.id === p.frame)?.box);
    check(frames.length === 2 && frames.every(Boolean) && Math.abs((frames[0][2] - frames[0][0]) - (frames[1][2] - frames[1][0])) < 0.05, "both panels are the same width", JSON.stringify(frames));
    check(frames[1]?.[3] < frames[0]?.[1], "panel B is under panel A", JSON.stringify(frames));
    for (const item of fig?.[0].rows[0] ?? []) {
      const s = d.structures.find((x) => x.id === item.structure), n = d.captions.find((x) => x.id === item.number);
      check(s && n && Math.abs((s.box[0] + s.box[2]) / 2 - (n.box[0] + n.box[2]) / 2) < 0.3, `${n?.text}: the number is centred under its structure`, JSON.stringify([s?.box, n?.box]));
    }
    // A frame holds its panel, so only what is outside the frames can overlap.
    const loose = { ...d, captions: d.captions };
    layout(loose, "the figure");
  },
  async 7(a) {
    console.log("7. Export: the dialog opens, and the next call still answers");
    const e = await a.call("advanced", { tool: "export", args: { format: "pdf" } });
    check(!e.isError, "the Export dialog opens on PDF", e.text);
    const d = await a.call("read", {});
    check(!d.isError, "read still answers", d.text.slice(0, 200));
  },
};

const want = process.argv.slice(2);
const order = ["1", "2", "3", "4", "5", "6", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "7"].filter((k) => !want.length || want.includes(k));
const a = await client("acceptance");
// Cases 2 to 4 run in case 1's drawing, and 6 in case 5's; run alone, each starts its own.
for (const k of order) {
  if (["2", "3", "4"].includes(k) && !order.includes("1") && k === order[0]) await a.call("drawings", { action: "new", for: "paper" });
  try { await CASES[k](a); } catch (e) { check(false, `case ${k} ran to the end`, e.message); }
}
console.log(failed ? `${failed} check${failed === 1 ? "" : "s"} failed.` : "Every check passed.");
process.exit(failed ? 1 : 0);
