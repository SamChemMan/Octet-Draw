// Run: node scripts/mcp-bench/run.ts [--write] [CASE ...]
// The MCP benchmark (docs/plans/mcp-v2.md, section 14, step 0): each case in cases/ is a whole job as an AI app does
// it, replayed in Octet with no window (scripts/headless/host.ts). It measures what the job costs the AI app and the
// user: tool calls, failed calls, characters of arguments written, characters of replies read, and Octet's own time.
// A call that Octet refuses counts as failed: the AI app pays for it with a round trip.
// It also measures what every chat pays before its first call: the size of tools/list and of the instructions.
// The numbers are kept in results.json. A run compares with them, and a worse number fails the run; --write keeps the
// new numbers (after a change that is meant to move them). Time is the best of three runs, and fails past 1.2 times
// the kept time plus 50 ms (the rest is noise).
// A case is cases/NAME.mjs with a default export:
//   about     one line: what the job is and where it comes from
//   for       the drawing it starts in (File > New For): paper by default
//   calls     [{ name, arguments }]: arguments may be a function of the results so far, for ids made earlier
//   expect    { smiles: { number: SMILES or InChIKey } }: each compound number's structure in the finished drawing
// corpus/PAPER.json holds jobs from one paper (corpus/README.md): each is a case of one call. A name on the command
// line runs that case, or every job of that paper.
// Right counts those; Warnings is Octet's own count for the finished drawing (chemistry and layout).
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";

type Call = { name: string; arguments?: unknown | ((results: any[]) => unknown) };
type Case = { about: string; for?: string; calls: Call[]; expect?: { smiles?: Record<string, string> } };
type Measure = { calls: number; failed: number; sent: number; read: number; ms: number; slowest: number; right?: number; of?: number; warnings?: number };

// As draw.ts: Indigo's wasm as first compiled, so the process ends when the work does.
if (!process.execArgv.includes("--liftoff-only")) process.exit(spawnSync(process.execPath, ["--liftoff-only", ...process.execArgv, ...process.argv.slice(1)], { stdio: "inherit" }).status ?? 1);

const { load, drawing } = await import("../headless/host.ts");
const { handle } = await import("../../src/mcp.ts");
const { parseStructure, toInchiKey } = await import("../../src/chem.ts");
const here = new URL("./", import.meta.url), version = JSON.parse(readFileSync(new URL("../../package.json", here), "utf8")).version;
const argv = process.argv.slice(2), write = argv.includes("--write"), named = argv.filter((a) => a !== "--write");
// Every case by name: cases/NAME.mjs, and each job of corpus/PAPER.json (named PAPER-...).
const all = new Map<string, () => Promise<Case>>(readdirSync(new URL("cases/", here)).filter((f) => f.endsWith(".mjs")).map((f) => [f.slice(0, -4), async () => (await import(new URL(`cases/${f}`, here).href)).default]));
for (const f of existsSync(new URL("corpus/", here)) ? readdirSync(new URL("corpus/", here)).filter((x) => x.endsWith(".json")) : [])
  for (const j of JSON.parse(readFileSync(new URL(`corpus/${f}`, here), "utf8")).jobs) all.set(j.id, async () => ({ about: j.prompt, for: j.for, calls: [{ name: j.tool, arguments: j.arguments }], expect: j.expect }));
const keptTimes = Object.fromEntries(readdirSync(new URL("cases/", here)).map((f) => [f.slice(0, -4), true]));
const names = [...all.keys()].filter((n) => !named.length || named.some((x) => n === x || n.startsWith(`${x}-`))).sort();
await load();

const KEY = /^[A-Z]{14}-[A-Z]{10}-[A-Z]$/;
const keyOf = (text: string) => (KEY.test(text) ? text : toInchiKey(parseStructure(text)));

async function run(c: Case): Promise<Measure> {
  const d = drawing(c.for ?? "paper"), results: any[] = [], m: Measure = { calls: 0, failed: 0, sent: 0, read: 0, ms: 0, slowest: 0 };
  const rpc = async (method: string, params?: unknown) => JSON.parse(await handle(JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), () => d.host, version, { client: "Octet bench" }));
  for (const call of c.calls) {
    const args = typeof call.arguments === "function" ? call.arguments(results) : (call.arguments ?? {}), t = performance.now();
    const r = await rpc("tools/call", { name: call.name, arguments: structuredClone(args) }), ms = performance.now() - t;
    // What the AI app reads: the text and any picture (structuredContent repeats the text's data).
    const content: { text?: string; data?: string }[] = r.result?.content ?? [{ text: r.error?.message }];
    results.push(r.result?.structuredContent ?? {});
    m.calls++; m.sent += JSON.stringify(args).length; m.read += content.reduce((n, x) => n + (x.text?.length ?? 0) + (x.data?.length ?? 0), 0);
    m.ms += ms; m.slowest = Math.max(m.slowest, ms);
    if (r.error || r.result?.isError) m.failed++;
  }
  // The finished drawing, read in full outside the job's count.
  const end = (await rpc("tools/call", { name: "read_drawing", arguments: { detail: "full" } })).result?.structuredContent;
  const want = Object.entries(c.expect?.smiles ?? {});
  if (want.length) [m.right, m.of] = [want.filter(([number, text]) => end?.structures?.some((s: any) => s.number === number && s.inchiKey === keyOf(text))).length, want.length];
  m.warnings = end?.warnings?.length;
  return m;
}

const list = JSON.parse(await handle(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }), () => drawing().host, version)).result.tools;
const init = JSON.parse(await handle(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }), () => drawing().host, version)).result;
const now: { tools: number; toolsList: number; instructions: number; cases: Record<string, Measure> } = { tools: list.length, toolsList: JSON.stringify(list).length, instructions: init.instructions.length, cases: {} };
for (const name of names) {
  const c = await all.get(name)!();
  // ponytail: a corpus job is drawn once, not three times. Each call Indigo refuses uses up a little of its 64 KB
  // stack for good (the fault behind 1.1.1's crash, fixed in 1.1.2), and three runs of every job reach the end of it.
  // Best of three for all once that fix is merged in.
  const runs = name in keptTimes ? [await run(c), await run(c), await run(c)] : [await run(c)], best = runs.reduce((p, q) => (q.ms < p.ms ? q : p));
  now.cases[name] = { ...best, ms: Math.round(best.ms), slowest: Math.round(best.slowest) };
}

const file = new URL("results.json", here), kept: typeof now | undefined = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : undefined;
const worse: string[] = [];
const than = (what: string, a: number | undefined, b: number | undefined, slack = (v: number) => v) => { if (a !== undefined && b !== undefined && a > slack(b)) worse.push(`${what}: ${a}, was ${b}`); };
const tokens = (chars: number) => Math.round(chars / 3.5);
console.log(`tools/list: ${now.tools} tools, ${now.toolsList} characters (about ${tokens(now.toolsList)} tokens)${kept ? `, was ${kept.toolsList}` : ""}. Instructions: ${now.instructions} characters.`);
than("tools/list characters", now.toolsList, kept?.toolsList);
than("instructions characters", now.instructions, kept?.instructions);
console.log("| Case | Calls | Failed | Sent | Read | Octet ms | Slowest call ms | Right | Warnings |\n|---|---|---|---|---|---|---|---|---|");
for (const [name, m] of Object.entries(now.cases)) {
  const was = kept?.cases[name], cell = (k: "calls" | "failed" | "sent" | "read" | "ms" | "slowest" | "warnings") => (was && was[k] !== m[k] ? `${m[k]} (was ${was[k]})` : `${m[k] ?? ""}`);
  console.log(`| ${name} | ${cell("calls")} | ${cell("failed")} | ${cell("sent")} | ${cell("read")} | ${cell("ms")} | ${cell("slowest")} | ${m.of ? `${m.right} of ${m.of}` : ""} | ${cell("warnings")} |`);
  for (const k of ["calls", "failed", "sent", "read", "warnings"] as const) than(`${name} ${k}`, m[k], was?.[k]);
  than(`${name} ms`, m.ms, was?.ms, (v) => v * 1.2 + 50);
  if ((m.right ?? 0) < (was?.right ?? 0)) worse.push(`${name} structures right: ${m.right}, was ${was?.right}`);
}
if (write) writeFileSync(file, JSON.stringify(named.length && kept ? { ...now, cases: { ...kept.cases, ...now.cases } } : now, null, 1) + "\n");
else for (const w of worse) console.error(`WORSE ${w}`);
process.exit(write || !worse.length ? 0 : 1);
