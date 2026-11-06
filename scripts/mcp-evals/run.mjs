// The MCP evals (docs/plans/mcp.md, E3): Claude through the Messages API, given Octet's tools as an AI app gives
// them, does each case in cases.mjs in a drawing of its own; then each case's check reads the drawing. Run a dev build
// with OCTET_MCP=1 (the octet-mcp preview), and ANTHROPIC_API_KEY set, then:
//   node scripts/mcp-evals/run.mjs                    the train cases
//   node scripts/mcp-evals/run.mjs --held             the held-out cases too
//   node scripts/mcp-evals/run.mjs scheme-boc ...     those cases
//   --model claude-sonnet-5-5   --effort high   --repeat 3
// Each run writes scripts/mcp-evals/out/<time>/: a transcript for each case and summary.md (accuracy, tool calls,
// errors, tokens, time). Read the transcripts: they show where the tool wording misleads.
//
// Without an API key, an agent can do a case through the command line instead (each call in the case's session):
//   run.mjs prep <case>                 sets the case up and prints the prompt (and the picture's path)
//   run.mjs tools                       the server's instructions and the tools, as the AI app sees them
//   run.mjs call <case> <tool> '<json>' one tool call; a picture is saved and its path printed
//   run.mjs check <case> [answer-file]  the checks, and the calls the case made
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { connect } from "./octet.mjs";
import { CASES, WANT } from "./cases.mjs";

const here = dirname(fileURLToPath(import.meta.url)), OUT = join(here, "out");
mkdirSync(OUT, { recursive: true });
const argv = process.argv.slice(2), flag = (f, d) => { const k = argv.indexOf(f); return k >= 0 ? argv.splice(k, 2)[1] : d; };
const MODEL = flag("--model", "claude-opus-5-5"), EFFORT = flag("--effort", "medium"), REPEAT = Number(flag("--repeat", "1"));
const HELD = argv.includes("--held") ? (argv.splice(argv.indexOf("--held"), 1), true) : false;
const SYSTEM = "The user has connected Octet Draw, the chemical drawing app open on their computer, to you through MCP. A drawing is open in Octet; use Octet's tools to do what the user asks in it.";

// ---- What the checks compare with: each SMILES's InChIKey, as Octet reads it, and the pictures, as Octet draws them ----

// Each text's InChIKey, as Octet reads it, in a scratch drawing of the client's own (texts Octet cannot read are left out).
async function keysOf(o, texts) {
  const keys = {};
  await o.call("new_drawing", { for: "paper" });
  const draw = async (batch) => {
    const r = await o.call("draw_structures", { structures: batch.map((text) => ({ text })) });
    if (r.isError) { if (batch.length > 1) for (const t of batch) await draw([t]); return; }
    const d = await o.read(), made = r.structuredContent?.made ?? [];
    batch.forEach((text, j) => { const s = d.structures.find((x) => x.id === made[j]); if (s?.inchiKey) keys[text] = s.inchiKey; });
    await o.call("delete", { ids: d.structures.map((s) => s.id) });
  };
  for (let k = 0; k < texts.length; k += 10) await draw(texts.slice(k, k + 10));
  return keys;
}

async function prepare() {
  const keysFile = join(OUT, "keys.json"), keys = existsSync(keysFile) ? JSON.parse(readFileSync(keysFile, "utf8")) : {};
  const missing = WANT.filter((s) => !keys[s]), pictures = CASES.filter((c) => c.picture && !c.pictureFile && !existsSync(join(OUT, "pictures", `${c.id}.png`)));
  if (!missing.length && !pictures.length) return keys;
  const o = await connect("octet-evals-prepare");
  Object.assign(keys, await keysOf(o, missing));
  const still = WANT.filter((s) => !keys[s]);
  if (still.length) throw new Error(`Octet gave no InChIKey for ${still.join(", ")}`);
  writeFileSync(keysFile, JSON.stringify(keys, null, 1));
  mkdirSync(join(OUT, "pictures"), { recursive: true });
  for (const c of pictures) {
    await o.call("new_drawing", { for: "paper" });
    await o.call(c.picture.reaction ? "draw_reaction" : "draw_structures", c.picture.reaction ?? c.picture);
    const png = (await o.call("read_drawing", { picture: true })).content.find((x) => x.type === "image");
    writeFileSync(join(OUT, "pictures", `${c.id}.png`), Buffer.from(png.data, "base64"));
  }
  return keys;
}

// A case's own drawing and its setup, in a new session: the AI app's calls go to that drawing.
async function start(c) {
  const o = await connect(`octet-evals-${c.id}`);
  const made = await o.call("new_drawing", { for: c.for ?? "paper" });
  if (made.isError) throw new Error(`${c.id}: new_drawing: ${made.text}`);
  for (const [tool, args] of c.setup ?? []) { const r = await o.call(tool, args); if (r.isError) throw new Error(`${c.id}: setup ${tool}: ${r.text}`); }
  return o;
}
const picturePath = (c) => (c.pictureFile ? join(OUT, c.pictureFile) : c.picture && join(OUT, "pictures", `${c.id}.png`));
const picture = (c) => picturePath(c) && readFileSync(picturePath(c)).toString("base64");
async function verify(c, o, keys, answer) {
  const d = await o.read(), key = (s) => keys[s], loose = (s) => keys[s].split("-")[0];
  // The structures the answer gives as SMILES (words with the look of one), by InChIKey.
  const smiles = c.answerSmiles ? [...new Set((answer ?? "").match(/[A-Za-z0-9@+\-[\]()=#/\\%.]{4,}/g) ?? [])].filter((w) => /[()=#\]]|\d/.test(w) && /^[BCNOSPFIcnosp[]/.test(w)) : [];
  const answered = smiles.length ? Object.values(await keysOf(await connect("octet-evals-answer"), smiles)) : [];
  const checks = c.check({ d, answer: answer ?? "", key, loose, answered }).map(([ok, what, found]) => ({ ok: !!ok, what, ...(ok ? {} : { found }) }));
  return { pass: checks.every((x) => x.ok), checks, drawing: d };
}

// ---- Claude through the API ----

async function messages(body) {
  for (let tries = 0; ; tries++) {
    const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" }, body: JSON.stringify(body) });
    if (r.ok) return r.json();
    const text = await r.text();
    if (tries < 5 && (r.status === 429 || r.status >= 500)) { await new Promise((ok) => setTimeout(ok, 1000 * (Number(r.headers.get("retry-after")) || 2 ** tries * 5))); continue; }
    throw new Error(`The API answered ${r.status}: ${text.slice(0, 500)}`);
  }
}
// MCP content to the API's tool_result content: text and pictures.
const content = (res) => (res.content ?? []).flatMap((x) => (x.type === "text" ? [{ type: "text", text: x.text }] : x.type === "image" ? [{ type: "image", source: { type: "base64", media_type: x.mimeType, data: x.data } }] : []));

async function viaApi(c, tools, keys, instructions) {
  const o = await start(c), t0 = Date.now(), png = picture(c);
  const msgs = [{ role: "user", content: [...(png ? [{ type: "image", source: { type: "base64", media_type: "image/png", data: png } }] : []), { type: "text", text: c.prompt }] }];
  const use = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, calls = [];
  let answer = "", stop;
  for (let turn = 0; turn < 40; turn++) {
    const r = await messages({ model: MODEL, max_tokens: 16000, output_config: { effort: EFFORT }, system: [{ type: "text", text: `${SYSTEM}${instructions ? `\n\nOctet's instructions:\n${instructions}` : ""}`, cache_control: { type: "ephemeral" } }], tools, messages: msgs, cache_control: { type: "ephemeral" } });
    use.input += r.usage.input_tokens; use.output += r.usage.output_tokens; use.cacheRead += r.usage.cache_read_input_tokens ?? 0; use.cacheWrite += r.usage.cache_creation_input_tokens ?? 0;
    msgs.push({ role: "assistant", content: r.content });
    stop = r.stop_reason;
    answer = r.content.filter((b) => b.type === "text").map((b) => b.text).join("\n") || answer;
    if (stop !== "tool_use") break;
    const results = [];
    for (const b of r.content.filter((x) => x.type === "tool_use")) {
      const s = Date.now(), res = await o.call(b.name, b.input);
      calls.push({ tool: b.name, input: b.input, error: !!res.isError, ms: Date.now() - s, chars: JSON.stringify(b.input).length, text: res.text.slice(0, 2000) });
      results.push({ type: "tool_result", tool_use_id: b.id, content: content(res), ...(res.isError ? { is_error: true } : {}) });
    }
    msgs.push({ role: "user", content: results });
  }
  const v = await verify(c, o, keys, answer);
  return { id: c.id, set: c.set, job: c.job, ...v, stop, answer, calls, usage: use, seconds: (Date.now() - t0) / 1000, transcript: msgs };
}

const toolsForApi = (list) => list.map((t, k) => ({ name: t.name, description: t.description, input_schema: t.inputSchema, ...(k === list.length - 1 ? { cache_control: { type: "ephemeral" } } : {}) }));
const summary = (runs) => {
  const pct = (a, b) => `${b ? Math.round((100 * a) / b) : 0}%`, rows = runs.map((r) => `| ${r.id} | ${r.set} | ${r.pass ? "pass" : "FAIL"} | ${r.checks.filter((x) => x.ok).length}/${r.checks.length} | ${r.calls.length} | ${r.calls.filter((x) => x.error).length} | ${r.usage.input + r.usage.cacheRead + r.usage.cacheWrite} | ${r.usage.output} | ${r.seconds.toFixed(0)} | ${r.checks.filter((x) => !x.ok).map((x) => `${x.what}${x.found ? ` (${String(x.found).slice(0, 60)})` : ""}`).join("; ")} |`);
  const of = (set) => runs.filter((r) => r.set === set), line = (set) => `${set}: ${of(set).filter((r) => r.pass).length} of ${of(set).length} pass (${pct(of(set).filter((r) => r.pass).length, of(set).length)})`;
  // Calls and seconds to done for each case: their median and total, the measure of speed (plan section 19, F7).
  const median = (l) => { const v = [...l].sort((p, q) => p - q), k = v.length >> 1; return v.length ? (v.length % 2 ? v[k] : (v[k - 1] + v[k]) / 2) : 0; };
  const calls = runs.map((r) => r.calls.length), secs = runs.map((r) => r.seconds);
  const sum = (l) => l.reduce((p, q) => p + q, 0), octet = sum(runs.flatMap((r) => r.calls.map((x) => x.ms))) / 1000, chars = sum(runs.flatMap((r) => r.calls.map((x) => x.chars ?? 0)));
  const speed = `Calls: median ${median(calls)}, total ${sum(calls)}. Seconds to done: median ${median(secs).toFixed(0)}, total ${sum(secs).toFixed(0)}, of which Octet ${octet.toFixed(1)}. Arguments written: ${chars} characters, output tokens ${sum(runs.map((r) => r.usage.output))}.`;
  return [`# MCP evals: ${MODEL}, effort ${EFFORT}`, "", [line("train"), HELD ? line("held") : ""].filter(Boolean).join(". "), "", speed, "", "| Case | Set | Result | Checks | Calls | Errors | Input tokens | Output tokens | Seconds | Failed checks |", "|---|---|---|---|---|---|---|---|---|---|", ...rows, ""].join("\n");
};

// ---- The command line ----

const cmd = argv[0], byId = (id) => CASES.find((c) => c.id === id) ?? (() => { throw new Error(`no case ${id}`); })();
// MCP_EVAL_DIR names the folder under out/ for a run of agents (agent by default), so runs before and after a change
// are kept apart.
const AGENT = process.env.MCP_EVAL_DIR ?? "agent", state = (id) => join(OUT, AGENT, `${id}.json`);
// The case's session, or (when Octet has let it go: it keeps 64) a new one in the case's drawing.
async function resume(name, s) {
  const o = await connect(name, s.session);
  if (!(await o.call("list_drawings")).isError) return o;
  const fresh = await connect(name);
  await fresh.call("use_drawing", { drawing: s.drawing });
  return fresh;
}
if (cmd === "tools") {
  // As an AI app gives them to its model: the server's instructions, then each tool.
  const o = await connect("octet-evals-tools");
  console.log(JSON.stringify({ instructions: o.instructions, tools: (await o.tools()).map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema })) }, null, 1));
} else if (cmd === "prep") {
  const c = byId(argv[1]);
  await prepare();
  const o = await start(c);
  mkdirSync(join(OUT, AGENT), { recursive: true });
  writeFileSync(state(c.id), JSON.stringify({ session: o.session, drawing: (await o.read()).drawing.id, n: 0, started: Date.now() }));
  writeFileSync(join(OUT, AGENT, `${c.id}.calls.jsonl`), "");
  console.log(c.prompt);
  if (picturePath(c)) console.log(`\nThe user attached this picture: ${picturePath(c)}`);
} else if (cmd === "call") {
  const [, id, tool, json] = argv, s = JSON.parse(readFileSync(state(id), "utf8"));
  const o = await resume("octet-evals-agent", s), input = json ? JSON.parse(json) : {}, t0 = Date.now(), res = await o.call(tool, input);
  s.n++; s.session = o.session; s.last = Date.now(); writeFileSync(state(id), JSON.stringify(s));
  const ms = Date.now() - t0;
  for (const x of res.content ?? []) {
    if (x.type === "text") console.log(x.text);
    if (x.type === "image") { const p = join(OUT, AGENT, `${id}-${s.n}.png`); writeFileSync(p, Buffer.from(x.data, "base64")); console.log(`[picture: ${p}]`); }
  }
  // ms: inside Octet; wall: this command from start to end (node, the session and the picture file too); chars: the
  // arguments the AI app wrote.
  appendFileSync(join(OUT, AGENT, `${id}.calls.jsonl`), JSON.stringify({ tool, input, error: !!res.isError, ms, wall: Math.round(process.uptime() * 1000), chars: json?.length ?? 0, text: res.text.slice(0, 2000) }) + "\n");
  if (res.isError) { console.log("(the tool answered with an error)"); process.exitCode = 1; }
} else if (cmd === "check") {
  const c = byId(argv[1]), s = JSON.parse(readFileSync(state(c.id), "utf8")), keys = await prepare();
  const answer = argv[2] && existsSync(argv[2]) ? readFileSync(argv[2], "utf8") : "";
  const calls = readFileSync(join(OUT, AGENT, `${c.id}.calls.jsonl`), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const v = await verify(c, await resume("octet-evals-check", s), keys, answer);
  // Seconds to done: from prep to the case's last call (the agent's thinking included), and the time inside Octet.
  // The split (plan section 21): Octet's own time, the command line's (node and the session, for each call), the
  // characters of arguments the AI app wrote, and the rest (the AI app thinking and writing).
  const sum = (f) => calls.reduce((t, x) => t + (f(x) ?? 0), 0), tenth = (ms) => Math.round(ms / 100) / 10;
  const seconds = s.started && s.last ? Math.round((s.last - s.started) / 1000) : undefined, octet = tenth(sum((x) => x.ms)), shell = tenth(sum((x) => x.wall && x.wall - x.ms));
  console.log(JSON.stringify({ id: c.id, pass: v.pass, calls: calls.length, seconds, octetSeconds: octet, shellSeconds: shell, otherSeconds: seconds === undefined ? undefined : Math.round(seconds - octet - shell), argChars: sum((x) => x.chars ?? JSON.stringify(x.input).length), checks: v.checks, errors: calls.filter((x) => x.error).map((x) => `${x.tool}: ${x.text.slice(0, 200)}`) }, null, 1));
} else {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("Set ANTHROPIC_API_KEY to run the evals through the API (or see prep, call and check above).");
  const keys = await prepare(), cases = argv.length ? argv.map(byId) : CASES.filter((c) => c.set === "train" || HELD);
  const client = await connect("octet-evals-tools"), tools = toolsForApi(await client.tools()), instructions = client.instructions, dir = join(OUT, new Date().toISOString().replace(/[:.]/g, "-"));
  mkdirSync(dir, { recursive: true });
  const runs = [];
  for (let k = 0; k < REPEAT; k++) for (const c of cases) {
    process.stdout.write(`${c.id}${REPEAT > 1 ? ` (${k + 1})` : ""}: `);
    let r;
    try { r = await viaApi(c, tools, keys, instructions); } catch (e) { r = { id: c.id, set: c.set, job: c.job, pass: false, checks: [{ ok: false, what: "ran", found: String(e.message) }], calls: [], usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, seconds: 0 }; }
    runs.push(r);
    writeFileSync(join(dir, `${c.id}${REPEAT > 1 ? `-${k + 1}` : ""}.json`), JSON.stringify(r, null, 1));
    console.log(`${r.pass ? "pass" : "FAIL"}, ${r.calls.length} calls, ${r.seconds.toFixed(0)} s${r.pass ? "" : `: ${r.checks.filter((x) => !x.ok).map((x) => x.what).join("; ")}`}`);
  }
  writeFileSync(join(dir, "summary.md"), summary(runs));
  console.log(`\n${summary(runs)}\nWritten to ${dir}`);
  process.exitCode = runs.every((r) => r.pass) ? 0 : 1;
}
