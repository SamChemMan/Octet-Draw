// The speed jobs (speed.mjs) through real Claude Code, which is what a user's model sees: tool search, what Claude Code
// keeps of the instructions and of each reply, and its own turns.
//   node scripts/mcp-evals/headless.ts &                        the server (or a dev build with OCTET_MCP=1)
//   node scripts/mcp-evals/real.mjs MODEL [TAG] [AT_ONCE] [JOB...]   MODEL as `claude --model` takes it (opus, haiku)
// Each job gets a fresh drawing (brief.mjs), then one `claude -p` with the user's message and Octet as its only MCP
// server (bridge.mjs), then judge.mjs. `claude` must be signed in (claude auth login). It runs in an empty folder with
// a bare environment, so no project instructions and no other servers reach the model.
// Prints a line for each job and the totals, and keeps Claude Code's own log of each job in out/real-TAG/.
// Compare runs by model s (the time the model took, which the Mac's load does not move), turns, out and pass; run each
// model three times, as one run's spread is about 5%.
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { SPEED } from "./speed.mjs";

const [model, tag = model, atOnce = "3", ...only] = process.argv.slice(2);
if (!model) throw new Error("Give the model: node scripts/mcp-evals/real.mjs opus");
const here = (f) => fileURLToPath(new URL(f, import.meta.url)), logs = here(`out/real-${tag}/`), empty = mkdtempSync(join(tmpdir(), "octet-real-"));
mkdirSync(logs, { recursive: true });
const PAPER = ["No, I have no preferred style.", "A paper, no particular journal.", "Nothing to emphasise."];
const env = { HOME: process.env.HOME, USER: process.env.USER, PATH: process.env.PATH, TERM: "xterm-256color", LANG: "en_GB.UTF-8" };
const one = (job) => new Promise((done) => {
  const row = { job: job.id, turns: 0, search: 0, calls: 0, out: 0, s: 0 };
  const set = spawnSync("node", [here("brief.mjs"), job.id], { encoding: "utf8" });
  if (set.status) return done({ ...row, pass: false, failed: "brief: " + set.stderr.slice(0, 160) });
  const prompt = `${job.prompt}\n\nIf you need them, my answers to Octet's three questions: ${(job.brief ?? PAPER).map((a, k) => `${k + 1}. ${a}`).join(" ")}`;
  const config = JSON.stringify({ mcpServers: { "octet-draw": { command: "node", args: [here("bridge.mjs"), job.id] } } });
  const p = spawn("claude", ["-p", prompt, "--model", model, "--mcp-config", config, "--strict-mcp-config", "--allowedTools", "mcp__octet-draw", "--output-format", "stream-json", "--verbose"], { cwd: empty, env, stdio: ["ignore", "pipe", "pipe"] });
  let text = "", err = "";
  p.stdout.on("data", (d) => { text += d; }); p.stderr.on("data", (d) => { err += d; });
  p.on("exit", () => {
    writeFileSync(`${logs}${job.id}.jsonl`, text);
    row.err = err.slice(0, 200);
    for (const l of text.split("\n")) {
      let m; try { m = JSON.parse(l); } catch { continue; }
      if (m.type === "assistant") for (const c of m.message.content ?? []) if (c.type === "tool_use") { if (c.name === "ToolSearch") row.search++; else if (c.name.startsWith("mcp__octet-draw__")) row.calls++; else row.other = (row.other ?? 0) + 1; }
      if (m.type === "result") {
        row.turns = m.num_turns; row.s = m.duration_ms / 1000; row.api = m.duration_api_ms / 1000; row.out = Object.values(m.modelUsage ?? {}).reduce((t, u) => t + (u.outputTokens ?? 0), 0); row.cost = m.total_cost_usd;
        writeFileSync(`${logs}${job.id}.answer.txt`, String(m.result ?? "")); if (m.is_error) row.err = String(m.result).slice(0, 200);
      }
    }
    const j = spawnSync("node", [here("judge.mjs"), job.id, `${logs}${job.id}.answer.txt`], { encoding: "utf8" });
    try { const r = JSON.parse(j.stdout.split("\n").find((x) => x.startsWith("{"))); row.pass = r.pass; row.refused = r.refused; row.failed = r.checks.filter((c) => !c.ok).map((c) => c.what).join("; ").slice(0, 160); } catch { row.pass = false; row.failed = "judge: " + (j.stderr || j.stdout).slice(0, 160); }
    done(row);
  });
});
const jobs = SPEED.filter((c) => !only.length || only.includes(c.id)), queue = [...jobs], rows = [];
await Promise.all(Array.from({ length: +atOnce }, async () => { for (let job; (job = queue.shift()); ) rows.push(await one(job)); }));
rows.sort((a, b) => jobs.findIndex((c) => c.id === a.job) - jobs.findIndex((c) => c.id === b.job));
for (const r of rows) console.log(`${r.job.padEnd(18)} ${r.pass ? "pass" : "FAIL"} turns ${r.turns} search ${r.search} calls ${r.calls} refused ${r.refused ?? "?"} out ${String(r.out).padStart(6)} model ${(r.api ?? 0).toFixed(1).padStart(5)} s wall ${r.s.toFixed(1).padStart(5)} s ${r.pass ? "" : r.failed}${r.err ? " ERR " + r.err : ""}`);
const sum = (k) => rows.reduce((t, r) => t + (r[k] ?? 0), 0);
const total = { tag, model, pass: rows.filter((r) => r.pass).length, of: rows.length, turns: sum("turns"), search: sum("search"), calls: sum("calls"), refused: sum("refused"), out: sum("out"), model_s: Math.round(sum("api")), wall_s: Math.round(sum("s")), cost: +sum("cost").toFixed(2) };
console.log("TOTAL", JSON.stringify(total));
writeFileSync(`${logs}summary.json`, JSON.stringify({ total, rows }, null, 1));
