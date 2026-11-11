// Run: node scripts/headless/draw.ts [--jobs N] [--out DIR] [--for PURPOSE] FILE...
// Octet with no window (host.ts): each input is drawn in a new drawing with the AI apps' tools (src/mcp.ts), and
// comes out as NAME.cdxml (get_file's CDXML, as Export writes it) and NAME.drawn.json (each call's result, and
// read_drawing's full reading: SMILES, InChI and InChIKey, sources, names, compound numbers, each reaction step's
// conditions, Octet's warnings). A call's result is short unless the call asks for detail: full. Each input starts from the first ids, so the same input gives the same files.
// An input is a .json file: a list of tool calls ([{"name": "draw_reaction", "arguments": {...}}, ...]), or one
// draw_reaction argument ({"start": [...], "steps": [...]}). A .jsonl file holds one input a line (NAME-1, NAME-2, ...).
// Inputs are drawn in parallel, one worker thread a core (--jobs sets how many); each worker loads Indigo and the
// names engine once (about a second), then draws an input in tenths of a second.
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { availableParallelism } from "node:os";
import { basename, dirname, join } from "node:path";
import { isMainThread, parentPort, Worker, workerData } from "node:worker_threads";

type Call = { name: string; arguments?: unknown };
type Input = { name: string; calls: Call[]; dir: string };
type Done = { name: string; ok: boolean; seconds: number; structures: number; warnings: number; errors: string[] };

const calls = (v: unknown): Call[] => {
  if (Array.isArray(v)) return v as Call[];
  if (v && typeof v === "object" && "steps" in v) return [{ name: "draw_reaction", arguments: v }];
  if (v && typeof v === "object" && "calls" in v) return (v as { calls: Call[] }).calls;
  throw new Error("not a list of tool calls or a draw_reaction argument");
};

if (isMainThread) {
  // Indigo's wasm runs as first compiled (as fast for these calls): with several workers, V8's optimising pass runs on
  // after the work is done, and the process waits seconds for it before it can end. The flag is the whole process's,
  // so the runner starts itself again with it.
  if (!process.execArgv.includes("--liftoff-only")) process.exit(spawnSync(process.execPath, ["--liftoff-only", ...process.execArgv, ...process.argv.slice(1)], { stdio: "inherit" }).status ?? 1);
  const args = process.argv.slice(2), files: string[] = [];
  let jobs = availableParallelism(), out: string | undefined, purpose = "paper";
  for (let k = 0; k < args.length; k++) {
    if (args[k] === "--jobs") jobs = Math.max(1, Number(args[++k]) || 1);
    else if (args[k] === "--out") out = args[++k];
    else if (args[k] === "--for") purpose = args[++k];
    else files.push(args[k]);
  }
  if (!files.length) { console.error("Usage: node scripts/headless/draw.ts [--jobs N] [--out DIR] [--for PURPOSE] FILE.json|FILE.jsonl ..."); process.exit(2); }
  const inputs: Input[] = [], refused: string[] = [];
  for (const f of files) {
    const name = basename(f).replace(/\.jsonl?$/i, ""), dir = out ?? dirname(f), text = readFileSync(f, "utf8");
    try {
      if (/\.jsonl$/i.test(f)) text.split("\n").forEach((line, k) => { if (line.trim()) inputs.push({ name: `${name}-${k + 1}`, calls: calls(JSON.parse(line)), dir }); });
      else inputs.push({ name, calls: calls(JSON.parse(text)), dir });
    } catch (e) { refused.push(`${f}: ${e instanceof Error ? e.message : e}`); }
  }
  for (const r of refused) console.error(`Cannot read ${r}`);
  if (out) mkdirSync(out, { recursive: true });
  const t0 = performance.now(), done: Done[] = [];
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(jobs, inputs.length) }, () => new Promise<void>((resolve, reject) => {
    const w = new Worker(new URL(import.meta.url), { workerData: { purpose } });
    const give = () => (next < inputs.length ? w.postMessage(inputs[next++]) : void w.terminate().then(() => resolve()));
    w.on("message", (d: Done | "ready") => {
      if (d !== "ready") { done.push(d); console.error(`${d.ok ? "ok  " : "FAIL"} ${d.name}: ${d.structures} structures, ${d.warnings} warnings, ${d.seconds.toFixed(2)} s${d.errors.length ? ` (${d.errors.join("; ")})` : ""}`); }
      give();
    });
    w.on("error", reject);
  })));
  const failed = done.filter((d) => !d.ok).length;
  console.error(`Drew ${done.length - failed} of ${inputs.length} inputs in ${((performance.now() - t0) / 1000).toFixed(1)} s with ${Math.min(jobs, inputs.length)} workers.`);
  process.exit(failed || refused.length ? 1 : 0);
} else {
  const { load, drawing } = await import("./host.ts");
  const { handle } = await import("../../src/mcp.ts");
  const version = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")).version;
  await load();
  parentPort!.on("message", async (input: Input) => {
    const t = performance.now(), d = drawing(workerData.purpose, input.name), errors: string[] = [];
    let id = 0, structures = 0, warnings = 0;
    const call = async (c: Call) => JSON.parse(await handle(JSON.stringify({ jsonrpc: "2.0", id: ++id, method: "tools/call", params: c }), () => d.host, version, { client: "Octet headless" }));
    try {
      const results: unknown[] = [];
      for (const c of input.calls) {
        const r = await call(c), text: string = r.error?.message ?? r.result?.content?.[0]?.text ?? "";
        if (r.error || r.result?.isError) errors.push(`${c.name}: ${text.split("\n")[0]}`);
        // The result's text without the JSON after it, which is its structuredContent (data).
        results.push({ tool: c.name, text: text.split("\n")[0], ...(r.result?.structuredContent ? { data: r.result.structuredContent } : {}), ...(r.result?.isError || r.error ? { error: true } : {}) });
      }
      const reading = (await call({ name: "read_drawing", arguments: { detail: "full" } })).result.structuredContent, file = (await call({ name: "get_file", arguments: { format: "cdxml" } })).result;
      if (file.isError) throw new Error(file.content[0].text);
      writeFileSync(join(input.dir, `${input.name}.cdxml`), file.structuredContent.text);
      writeFileSync(join(input.dir, `${input.name}.drawn.json`), JSON.stringify({ name: input.name, results, drawing: reading }, null, 1));
      [structures, warnings] = [reading.structures.length, reading.warnings.length];
    } catch (e) { errors.push(e instanceof Error ? e.message : String(e)); }
    parentPort!.postMessage({ name: input.name, ok: !errors.length, seconds: (performance.now() - t) / 1000, structures, warnings, errors } satisfies Done);
  });
  parentPort!.postMessage("ready");
}
