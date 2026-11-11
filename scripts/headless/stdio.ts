#!/usr/bin/env node
// Run: scripts/headless/stdio.ts --headless --mcp. Octet with no window (host.ts) on standard input and output, one
// JSON-RPC message a line, as `Octet Draw --headless --mcp` answers (src-tauri/src/mcp.rs stdio), for the checks: they
// run the scripting page's examples (scripts/examples) against it with OCTET set to this file. drawings new with a
// file's text opens it in a drawing of its own, as a hidden window does (CDXML and the structure formats: no .oct).
import { createInterface } from "node:readline";
import type { Host } from "../../src/mcp.ts";
const { load, drawing, session } = await import("./host.ts");
const { handle } = await import("../../src/mcp.ts");
await load();

let d = drawing("quick"), n = 0;
// The drawing the session's calls go to from now on, which opens the next one as a window does.
const opened = (next: typeof d): Host => {
  d = next;
  // A file it cannot read opens no window, and says so as the window's File > Open does (Editor.tsx readFile).
  d.host.opens = async (text) => { try { if (d.host.file(text)) return {}; } catch { /* as nothing read */ } return { failed: "Octet cannot read the structures in this file." }; };
  d.host.newWindow = (purpose, _session, text) => {
    const m = text === undefined ? undefined : d.host.file(text);
    const host = opened(drawing(purpose));
    if (m) host.set(m);
    return Promise.resolve(`headless-${++n}`);
  };
  return d.host;
};
opened(d);
for await (const line of createInterface({ input: process.stdin })) {
  if (JSON.parse(line).id !== undefined) process.stdout.write(`${await handle(line, () => d.host, "1", session("Octet headless", "stdio"))}\n`);
}
