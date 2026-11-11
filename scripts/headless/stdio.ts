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

// Each drawing open, by its id, as Octet's hidden windows: the first opens with Octet, the others with drawings new,
// which the session may close (mcp.rs mcp_close). unset: the session closed the drawing it used, so it has none until
// its next call that needs one, which takes the first, as a session with no drawing takes the window in front.
type Drawing = ReturnType<typeof drawing>;
const open = new Map<string, Drawing>(), own = new Set<string>();
let d: Drawing, n = 0, unset = false;
// The drawing the session's calls go to from now on, which opens the next one as a window does.
const opened = (id: string, next: Drawing): Host => {
  open.set(id, (d = next));
  unset = false;
  // A file it cannot read opens no window, and says so as the window's File > Open does (Editor.tsx readFile).
  d.host.opens = async (text) => { try { if (d.host.file(text)) return {}; } catch { /* as nothing read */ } return { failed: "Octet cannot read the structures in this file." }; };
  d.host.newWindow = (purpose, _session, text) => {
    const m = text === undefined ? undefined : d.host.file(text), k = `headless-${++n}`;
    own.add(k);
    const host = opened(k, drawing(purpose));
    if (m) host.set(m);
    return Promise.resolve(k);
  };
  d.host.window = () => ({ id, name: "Untitled" });
  d.host.windows = async () => [...open.keys()].map((k) => ({ id: k, name: "Untitled", edited: false }));
  d.host.target = async (_session, k) => { const x = open.get(k); if (x) [d, unset] = [x, false]; return !!x; };
  d.host.close = async (_session, k) => { if (!own.delete(k)) return undefined; if (open.get(k) === d) unset = true; open.delete(k); return true; };
  return d.host;
};
opened("headless", drawing("quick"));
for await (const line of createInterface({ input: process.stdin })) {
  const m = JSON.parse(line);
  if (m.id === undefined) continue;
  if (unset && m.method === "tools/call" && m.params?.name !== "drawings") [d, unset] = [open.values().next().value!, false];
  process.stdout.write(`${await handle(line, () => d.host, "1", { ...session("Octet headless", "stdio"), unset })}\n`);
}
