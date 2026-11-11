// One tool call of a lean job (brief.mjs), as an AI app makes it: node scripts/mcp-evals/call.mjs JOB TOOL 'JSON'.
// Prints the reply's text as the AI app gets it, and ends with 1 when Octet answers with an error. Each call is kept in
// out/lean/JOB.calls.jsonl: the characters sent and read, and whether Octet refused it.
import { appendFileSync, readFileSync } from "node:fs";
import { connect } from "./octet.mjs";

const [id, tool, json = "{}"] = process.argv.slice(2), at = new URL(`out/lean/${id}`, import.meta.url);
const s = JSON.parse(readFileSync(new URL(`${at}.json`), "utf8"));
if (s.info) process.env.OCTET_MCP_INFO ??= s.info;
let args, res;
try { args = JSON.parse(json); } catch (e) { res = { isError: true, text: `The arguments are not JSON: ${e.message}` }; }
res ??= await (await connect("octet-lean", s.session)).call(tool, args);
const text = res.content ? res.content.map((c) => (c.type === "text" ? c.text : `[${c.type}]`)).join("\n") : res.text;
console.log(text);
appendFileSync(new URL(`${at}.calls.jsonl`), JSON.stringify({ tool, sent: json.length, read: text.length, refused: !!res.isError, at: Date.now() }) + "\n");
process.exitCode = res.isError ? 1 : 0;
