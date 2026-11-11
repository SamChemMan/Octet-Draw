// Run: node scripts/mcp-evals/headless.ts. Octet's MCP server with no window, for the evals: the tools of src/mcp.ts on
// drawings kept in memory (scripts/headless/host.ts), over the Streamable HTTP that the app's server speaks
// (src-tauri/src/mcp.rs): POST /mcp on 127.0.0.1 with the key as a bearer token, a session for each initialize (the
// mcp-session-id header), DELETE to end one, and a call with a progress token answered as an event stream. Each
// session has its own drawing in a worker thread of its own, as each window in the app has its own page, so ids and
// the stacks of undo steps are the session's alone; `drawings` new gives the session a fresh drawing. There is no
// picture: a call that asks for one answers without it, and says so. There is no event stream to GET (subscriptions
// need the app) and no other windows.
// It writes its port and key to the file OCTET_MCP_INFO names (out/headless.json when it is not set). Clients that
// are run with the same OCTET_MCP_INFO (octet.mjs, run.mjs, call.mjs, the acceptance script) use this server.
import { randomBytes, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type ServerResponse } from "node:http";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { isMainThread, parentPort, Worker } from "node:worker_threads";

if (!isMainThread) {
  // One session: its drawing and its brief (set_brief, when the tools have it), as the app keeps them for a session.
  const { load, drawing } = await import("../headless/host.ts");
  const { handle } = await import("../../src/mcp.ts");
  const version = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")).version;
  void load();
  const d = drawing(), stopped = new Set<number>();
  let brief: string | null = null;
  parentPort!.on("message", async (m: { n: number; body?: string; client?: string; session?: string; cancel?: boolean }) => {
    if (m.cancel) { stopped.add(m.n); return; }
    // cancelled answers after the messages waiting, so a notifications/cancelled sent during the call is seen.
    const from = { client: m.client, session: m.session, brief, keep: (b: string) => { brief = b; }, progress: (note: string) => parentPort!.postMessage({ n: m.n, progress: note }), cancelled: () => new Promise<boolean>((ok) => setImmediate(() => ok(stopped.has(m.n)))) };
    parentPort!.postMessage({ n: m.n, reply: await handle(m.body!, () => d.host, version, from) });
  });
} else {
  const MAX_BODY = 4 * 1024 * 1024, MOST = 32; // each session's worker holds about 270 MB
  const INFO = process.env.OCTET_MCP_INFO ?? fileURLToPath(new URL("out/headless.json", import.meta.url));
  const key = randomBytes(16).toString("hex");
  type Waiting = { res: ServerResponse; rid: unknown; stream: boolean; picture: boolean };
  type Session = { worker: Worker; client: string; last: number; waiting: Map<number, Waiting> };
  const sessions = new Map<string, Session>();
  let next = 0;
  const send = (res: ServerResponse, status: number, body = "", head: Record<string, string> = {}) => { res.writeHead(status, { "cache-control": "no-store", ...(body ? { "content-type": "application/json" } : {}), ...head }); res.end(body); };
  const error = (id: unknown, code: number, message: string) => JSON.stringify({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });
  // A reply as the AI app gets it; a call that asked for a picture says that there is none here.
  const told = (picture: boolean, reply: string) => {
    if (!picture) return reply;
    const r = JSON.parse(reply), content = r.result?.content;
    if (!content || content.some((c: { type: string }) => c.type === "image")) return reply;
    content.push({ type: "text", text: "No picture: this Octet has no window (the headless server for evals)." });
    return JSON.stringify(r);
  };
  const end = (id: string) => { sessions.get(id)?.worker.terminate(); return sessions.delete(id); };
  function start(client: string): string {
    // At most MOST sessions: a new one takes the place of the one unused longest that has no call under way.
    if (sessions.size >= MOST) { const old = [...sessions].filter(([, s]) => !s.waiting.size).sort((p, q) => p[1].last - q[1].last)[0]; if (old) end(old[0]); }
    const id = randomBytes(16).toString("hex"), s: Session = { worker: new Worker(new URL(import.meta.url)), client, last: Date.now(), waiting: new Map() };
    s.worker.on("message", (m: { n: number; progress?: string; reply?: string }) => {
      const w = s.waiting.get(m.n);
      if (!w) return;
      if (m.progress !== undefined) { if (w.stream) w.res.write(`event: message\ndata: ${m.progress}\n\n`); return; }
      s.waiting.delete(m.n);
      const reply = told(w.picture, m.reply!);
      if (w.stream) w.res.end(`event: message\ndata: ${reply}\n\n`);
      else send(w.res, 200, reply, { "mcp-session-id": id });
    });
    s.worker.on("error", (e) => { for (const w of s.waiting.values()) send(w.res, 200, error(w.rid, -32603, `Octet stopped: ${e.message}`)); sessions.delete(id); });
    sessions.set(id, s);
    return id;
  }
  const server = createServer(async (req, res) => {
    const port = (server.address() as { port: number }).port, ours = (h?: string) => h === `127.0.0.1:${port}` || h === `localhost:${port}`;
    if (req.url?.split("?")[0] !== "/mcp") return send(res, 404);
    if (!ours(req.headers.host) || (req.headers.origin !== undefined && !ours(req.headers.origin.replace(/^http:\/\//, "")))) return send(res, 403);
    const given = Buffer.from((req.headers.authorization ?? "").replace(/^Bearer /, "").trim());
    if (given.length !== key.length || !timingSafeEqual(given, Buffer.from(key))) return send(res, 401);
    const sid = req.headers["mcp-session-id"] as string | undefined;
    if (req.method === "DELETE") return send(res, sid && end(sid) ? 200 : 404);
    if (req.method !== "POST") return send(res, 405);
    const parts: Buffer[] = [];
    let size = 0;
    for await (const p of req) { size += p.length; if (size > MAX_BODY) return send(res, 413); parts.push(p); }
    const body = Buffer.concat(parts).toString("utf8");
    let msg;
    try { msg = JSON.parse(body); } catch { return send(res, 400, error(null, -32700, "The request is not JSON.")); }
    // A notification or a response needs no answer; notifications/cancelled stops the call it names.
    if (msg?.id === undefined || !msg.method) {
      const s = sid ? sessions.get(sid) : undefined;
      if (s && msg?.method === "notifications/cancelled") for (const [n, w] of s.waiting) if (w.rid === msg.params?.requestId) s.worker.postMessage({ n, cancel: true });
      return send(res, 202);
    }
    const id = msg.method === "initialize" ? start(String(msg.params?.clientInfo?.name ?? "").slice(0, 60).trim() || "An AI app") : sid;
    const s = id ? sessions.get(id) : undefined;
    if (!s) return send(res, sid ? 404 : 400);
    s.last = Date.now();
    const n = ++next, stream = msg.params?._meta?.progressToken !== undefined;
    if (stream) res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", "mcp-session-id": id! });
    s.waiting.set(n, { res, rid: msg.id, stream, picture: msg.method === "tools/call" && /"picture(_size)?"\s*:\s*(true|")/.test(body) });
    s.worker.postMessage({ n, body, client: s.client, session: id });
  });
  server.listen(0, "127.0.0.1", () => {
    const { port } = server.address() as { port: number };
    mkdirSync(dirname(INFO), { recursive: true });
    writeFileSync(INFO, JSON.stringify({ port, token: key, pid: process.pid }));
    console.log(`Octet (headless) serves MCP at http://127.0.0.1:${port}/mcp. Its port and key are in ${INFO}: run clients with OCTET_MCP_INFO=${INFO}.`);
  });
  for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => { rmSync(INFO, { force: true }); process.exit(0); });
}
