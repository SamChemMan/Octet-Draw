#!/usr/bin/env node
// A lean job's drawing (brief.mjs) as an MCP server on standard input and output, for a real AI app: real.mjs gives
// `claude -p` this as its only MCP server. node scripts/mcp-evals/bridge.mjs JOB. tools/list and each tools/call go to
// the job's own session, so judge.mjs reads the same drawing. Each call is kept in out/lean/JOB.calls.jsonl, as call.mjs
// keeps it.
import { appendFileSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline";

const at = new URL(`out/lean/${process.argv[2]}`, import.meta.url), s = JSON.parse(readFileSync(new URL(`${at}.json`), "utf8"));
if (s.info) process.env.OCTET_MCP_INFO ??= s.info;
const { connect } = await import("./octet.mjs");
// The instructions come with a session's first message only: a second session asks for them.
const o = await connect("octet-lean", s.session), { instructions } = await connect("octet-lean-instructions");
const say = (m) => process.stdout.write(JSON.stringify(m) + "\n");
for await (const line of createInterface({ input: process.stdin })) {
  let m; try { m = JSON.parse(line); } catch { continue; }
  if (m.id === undefined) continue;
  const reply = (result) => say({ jsonrpc: "2.0", id: m.id, result });
  if (m.method === "initialize") reply({ protocolVersion: m.params?.protocolVersion ?? "2025-11-25", capabilities: { tools: { listChanged: false } }, serverInfo: { name: "Octet Draw", version: "lab" }, instructions });
  else if (m.method === "tools/list") reply({ tools: await o.tools() });
  else if (m.method === "ping") reply({});
  else if (m.method === "tools/call") {
    const { text, ...res } = await o.call(m.params.name, m.params.arguments ?? {});
    appendFileSync(new URL(`${at}.calls.jsonl`), JSON.stringify({ tool: m.params.name, sent: JSON.stringify(m.params.arguments ?? {}).length, read: text.length, refused: !!res.isError, at: Date.now() }) + "\n");
    reply(res);
  } else say({ jsonrpc: "2.0", id: m.id, error: { code: -32601, message: `Not taken: ${m.method}` } });
}
