// Octet Draw in Claude Desktop (decision 0021): the bundle's server. It starts Octet's own relay, the program that
// Octet names in its mcp.json, with --mcp, and hands it standard input and output. With no mcp.json (AI apps never
// turned on), it answers each request with the fix.
const { spawn } = require("node:child_process");
const { existsSync, readFileSync } = require("node:fs");
const { homedir } = require("node:os");
const { join } = require("node:path");

const id = "io.github.samchemman.octet-draw";
const dir = process.platform === "darwin" ? join(homedir(), "Library", "Application Support", id)
  : process.platform === "win32" ? join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), id)
  : join(process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"), id);
let program;
try { program = JSON.parse(readFileSync(join(dir, "mcp.json"), "utf8")).program; } catch {}

if (program && existsSync(program)) {
  const relay = spawn(program, ["--mcp"], { stdio: "inherit", windowsHide: true });
  relay.on("exit", (code) => process.exit(code ?? 0));
  relay.on("error", () => process.exit(1));
} else {
  const fix = "Open Octet Draw and turn on Settings > General > AI apps > Let AI apps use Octet. Then quit and open Claude again.";
  let rest = "";
  process.stdin.on("data", (chunk) => {
    const lines = (rest + chunk).split("\n");
    rest = lines.pop();
    for (const line of lines) {
      let m;
      try { m = JSON.parse(line); } catch { continue; }
      if (m && m.id !== undefined && m.method) process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: m.id, error: { code: -32603, message: fix } }) + "\n");
    }
  });
}
