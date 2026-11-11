// Octet Draw for a script (docs/scripting.md): starts Octet with no window and calls its tools. Nothing to install.
// The program is OCTET, or the path given. open and save read and write the files: Octet's tools take no path.
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";

const BINARY = ["cdx", "pdf", "png", "emf", "eps", "tif", "jpg", "gif"]; // read gives these in base64
export function octet(program = process.env.OCTET) {
  const p = spawn(program, ["--headless", "--mcp"], { stdio: ["pipe", "pipe", "inherit"] }), waiting = new Map();
  let n = 0;
  createInterface({ input: p.stdout }).on("line", (line) => { const m = JSON.parse(line); waiting.get(m.id)?.(m); waiting.delete(m.id); });
  p.on("exit", () => waiting.forEach((done) => done({ error: { message: "Octet ended." } })));
  const ask = (method, params) => new Promise((done) => { waiting.set(++n, done); p.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: n, method, params }) + "\n"); });
  const hello = ask("initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "script", version: "1" } });
  const call = async (tool, args = {}) => {
    await hello;
    const m = await ask("tools/call", { name: tool, arguments: args });
    if (m.error || m.result.isError) throw new Error(m.error?.message ?? m.result.content[0].text);
    return m.result.structuredContent ?? m.result.content[0].text;
  };
  const ext = (path) => path.split(".").pop().toLowerCase();
  return {
    call,
    open: (path) => call("drawings", { action: "new", text: readFileSync(path, ext(path) === "cdx" ? "base64" : "utf8") }),
    save: async (path, format = ext(path)) => writeFileSync(path, (await call("read", { format })).text, BINARY.includes(format) ? "base64" : "utf8"),
    close: () => new Promise((done) => { if (p.exitCode !== null) return done(); p.on("exit", done); p.stdin.end(); }),
  };
}
