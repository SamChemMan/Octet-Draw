// Run: node scripts/examples/one-request.mjs, with OCTET set as for the examples. A script that sends Octet one request
// and closes its end of the pipe gets the answer, and Octet ends with code 0. For Windows and Linux
// (.github/workflows/platforms.yml): it starts Octet as a script does, with pipes. PowerShell's own pipe into a
// window program does not wait for it or read its answer (run 43136709661), so it is no test of Octet.
import { spawn } from "node:child_process";

const hello = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "ci", version: "1" } } };
const p = spawn(process.env.OCTET, ["--headless", "--mcp"], { stdio: ["pipe", "pipe", "inherit"] });
let reply = "";
p.stdout.on("data", (d) => { reply += d; });
p.stdin.end(JSON.stringify(hello) + "\n");
const code = await new Promise((done) => p.on("exit", done));
console.log(`exit ${code}: ${reply.trim()}`);
process.exitCode = code === 0 && reply.includes('"serverInfo"') ? 0 : 1;
