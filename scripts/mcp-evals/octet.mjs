// A plain MCP client for Octet's server (Streamable HTTP on 127.0.0.1), as the acceptance script uses: one session,
// JSON replies. attach() takes up a session made by another process (the eval's command-line calls).
import { readFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";

const dir = platform() === "darwin" ? join(homedir(), "Library/Application Support") : platform() === "win32" ? process.env.APPDATA : process.env.XDG_DATA_HOME ?? join(homedir(), ".local/share");
const info = () => { try { return JSON.parse(readFileSync(join(dir, "io.github.samchemman.octet-draw", "mcp.json"), "utf8")); } catch { return undefined; } };

export async function connect(name, session) {
  let found;
  for (const end = Date.now() + 60_000; Date.now() < end; await new Promise((r) => setTimeout(r, 1000))) {
    found = info();
    if (found && (await fetch(`http://127.0.0.1:${found.port}/mcp`, { method: "POST" }).then(() => true, () => false))) break;
  }
  if (!found) throw new Error("Octet's mcp.json is not there: start a dev build with OCTET_MCP=1.");
  const url = `http://127.0.0.1:${found.port}/mcp`;
  let n = 0;
  const post = async (body) => {
    const r = await fetch(url, { method: "POST", headers: { authorization: `Bearer ${found.token}`, "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-11-25", ...(session ? { "mcp-session-id": session } : {}) }, body: JSON.stringify(body) });
    session ??= r.headers.get("mcp-session-id") ?? undefined;
    const text = await r.text();
    return text ? JSON.parse(text) : undefined;
  };
  let instructions;
  if (!session) {
    instructions = (await post({ jsonrpc: "2.0", id: ++n, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name, version: "1" } } }))?.result?.instructions;
    await post({ jsonrpc: "2.0", method: "notifications/initialized" });
  }
  // A tool's result as MCP gives it (content, structuredContent, isError); a protocol error becomes an error result.
  const call = async (tool, args = {}) => {
    const r = await post({ jsonrpc: "2.0", id: Date.now() * 100 + (++n % 100), method: "tools/call", params: { name: tool, arguments: args } });
    const res = r?.result ?? { isError: true, content: [{ type: "text", text: JSON.stringify(r?.error ?? "no reply") }] };
    return { ...res, text: res.content?.find((c) => c.type === "text")?.text ?? "" };
  };
  const tools = async () => (await post({ jsonrpc: "2.0", id: ++n, method: "tools/list" })).result.tools;
  const read = async () => (await call("read_drawing", { detail: "full" })).structuredContent;
  return { call, tools, read, instructions, get session() { return session; } };
}
