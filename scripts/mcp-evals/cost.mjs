// What each lean job (brief.mjs) cost the model: node scripts/mcp-evals/cost.mjs LOGS JUDGED [--write]
//   LOGS     a folder of the agents' logs, one JSONL file an agent (Claude Code's transcript form, any model): the job
//            is the one its call.mjs commands name (or run.mjs call, the older harness's)
//   JUDGED   the judge.mjs lines of the same run, one a line
// For each job and in total: model turns (requests to the model), Octet calls, refused calls, other tool uses (the
// harness's, not the job's), output tokens and the thinking among them (when the log gives them apart), characters of
// arguments sent and of replies read, seconds from the agent's first entry to its last, and pass. One API reply comes
// as several log lines with the same usage: each reply counts once.
// The numbers are kept in cost.json. A run prints each change from them; --write keeps the new ones (after a change that
// is meant to move them). A model's run varies from one to the next, so nothing fails on a worse number: compare runs
// of a few repeats.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const argv = process.argv.slice(2), write = argv.includes("--write"), [logs, judged] = argv.filter((a) => a !== "--write");
if (!logs || !judged) throw new Error("Give the folder of agent logs and the file of judge lines.");
const judge = Object.fromEntries(readFileSync(judged, "utf8").split("\n").filter((l) => l.startsWith("{")).map((l) => { const j = JSON.parse(l); return [j.job, j]; }));
const rows = {}, models = new Set();
for (const f of readdirSync(logs).filter((x) => x.endsWith(".jsonl"))) {
  const text = readFileSync(join(logs, f), "utf8"), job = /(?:call\.mjs|run\.mjs call) ([\w-]+) /.exec(text)?.[1];
  if (!job) continue;
  const replies = new Map(), uses = new Map();
  let first, last;
  for (const line of text.split("\n")) {
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    if (e.timestamp) { first ??= e.timestamp; last = e.timestamp; }
    const m = e.message;
    if (m?.role !== "assistant") continue;
    if (m.model) models.add(m.model);
    if (m.usage) replies.set(m.id ?? `${f}:${replies.size}`, m.usage);
    for (const c of Array.isArray(m.content) ? m.content : []) if (c.type === "tool_use") uses.set(c.id, JSON.stringify(c.input ?? {}));
  }
  const usage = [...replies.values()], d = usage.map((u) => u.output_tokens_details ?? u.completion_tokens_details);
  const j = judge[job] ?? {}, octet = [...uses.values()].filter((x) => /call\.mjs|run\.mjs call/.test(x)).length;
  let id = job;
  for (let k = 2; rows[id]; k++) id = `${job} #${k}`;
  rows[id] = { pass: j.pass, turns: replies.size, calls: j.calls ?? octet, refused: j.refused, other: uses.size - octet, output: usage.reduce((t, u) => t + (u.output_tokens ?? 0), 0),
    thinking: d.some((x) => x && ("thinking_tokens" in x || "reasoning_tokens" in x)) ? d.reduce((t, x) => t + (x?.thinking_tokens ?? x?.reasoning_tokens ?? 0), 0) : undefined,
    sent: j.sent, read: j.read, seconds: first ? Math.round((Date.parse(last) - Date.parse(first)) / 1000) : undefined };
}
const file = new URL("cost.json", import.meta.url), kept = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")).jobs : {};
const COLS = [["turns", "Model turns"], ["calls", "Octet calls"], ["refused", "Refused"], ["other", "Other tool uses"], ["output", "Output tokens"], ["thinking", "Of which thinking"], ["sent", "Sent"], ["read", "Read"], ["seconds", "Seconds"]];
const cell = (r, was, k) => `${r[k] ?? "-"}${was && was[k] !== r[k] && was[k] !== undefined ? ` (was ${was[k]})` : ""}`;
const sum = (k) => Object.values(rows).reduce((t, r) => t + (r[k] ?? 0), 0);
console.log(`Models: ${[...models].join(", ") || "not in the logs"}\n\n| Job | Pass | ${COLS.map((c) => c[1]).join(" | ")} |\n|---|---|${COLS.map(() => "---|").join("")}`);
for (const [id, r] of Object.entries(rows).sort()) console.log(`| ${id} | ${r.pass === undefined ? "not judged" : r.pass ? "yes" : "NO"} | ${COLS.map(([k]) => cell(r, kept[id], k)).join(" | ")} |`);
console.log(`| Total (${Object.keys(rows).length}) | ${Object.values(rows).filter((r) => r.pass).length} | ${COLS.map(([k]) => sum(k)).join(" | ")} |`);
if (write) writeFileSync(file, JSON.stringify({ models: [...models], jobs: rows }, null, 1) + "\n");
