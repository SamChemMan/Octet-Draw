// The lean harness for one job (speed.mjs), as close as an AI app comes, so the turns counted are the job's own:
//   node scripts/mcp-evals/headless.ts &               the server (or a dev build with OCTET_MCP=1)
//   node scripts/mcp-evals/brief.mjs JOB > first.txt   sets the job up and prints the agent's first message
//   (the agent)                                        calls tools with call.mjs; its final message is its answer
//   node scripts/mcp-evals/judge.mjs JOB [ANSWER]      checks the drawing (and the answer file) and prints one JSON line
//   node scripts/mcp-evals/cost.mjs LOGS JUDGED        what each job cost the model (cost.mjs says more)
// The first message holds what an AI app gives its model: Octet's instructions and its tools as tools/list gives them
// (whatever tools the server lists), then the user's message, with the brief's answers when the job has them. The job's
// state (its session and calls) is in out/lean/.
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { connect } from "./octet.mjs";
import { SPEED } from "./speed.mjs";

const LEAN = fileURLToPath(new URL("out/lean/", import.meta.url)), CALL = fileURLToPath(new URL("call.mjs", import.meta.url));
const job = SPEED.find((c) => c.id === process.argv[2]);
if (!job) throw new Error(`No job ${process.argv[2]}. The jobs: ${SPEED.map((c) => c.id).join(", ")}`);
const o = await connect(`octet-lean-${job.id}`), tools = await o.tools();
const made = await o.call("drawings", { action: "new", for: job.for ?? "paper" });
if (made.isError) throw new Error(`drawings new: ${made.text}`);
// The user's drawing as it was before the chat.
for (const [tool, args] of job.setup ?? []) {
  const r = await o.call(tool, args);
  if (r.isError) throw new Error(`setup ${tool}: ${r.text}`);
}
mkdirSync(LEAN, { recursive: true });
writeFileSync(`${LEAN}${job.id}.json`, JSON.stringify({ session: o.session, info: process.env.OCTET_MCP_INFO, started: Date.now() }));
writeFileSync(`${LEAN}${job.id}.calls.jsonl`, "");
console.log(`The user has connected Octet Draw, the chemical drawing app open on their computer, to you through MCP. A drawing is open in Octet; use Octet's tools to do what the user asks in it.

To call one of Octet's tools, run one shell command: node ${CALL} ${job.id} TOOL 'ARGUMENTS'
ARGUMENTS is the tool's arguments as JSON. The command prints Octet's reply. Do nothing else in the shell. When the job is done, your final message is your answer to the user.

Octet's instructions:
${o.instructions}

Octet's tools:
${tools.map((t) => JSON.stringify({ name: t.name, description: t.description, input_schema: t.inputSchema })).join("\n")}

The user's message:
${job.prompt}${job.brief ? `\n\nIf you need them, my answers to Octet's three questions: ${job.brief.map((a, k) => `${k + 1}. ${a}`).join(" ")}` : ""}`);
