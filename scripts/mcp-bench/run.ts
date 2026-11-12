// Run: node scripts/mcp-bench/run.ts [--write] [CASE ...]
// The MCP benchmark (docs/plans/mcp-v2.md, section 14, step 0): each case in cases/ is a whole job as an AI app does
// it, replayed in Octet with no window (scripts/headless/host.ts). It measures what the job costs the AI app and the
// user: tool calls, failed calls, characters of arguments written, characters of replies read, and Octet's own time.
// A call that Octet refuses counts as failed: the AI app pays for it with a round trip. Coerced counts the lines that
// say Octet read an argument leniently (plan section 6): each is a form the AI app can learn to send right.
// It also measures what every chat pays before its first call: the size of tools/list and of the instructions.
// The numbers are kept in results.json. A run compares with them, and a worse number fails the run; --write keeps the
// new numbers (after a change that is meant to move them). Time is the best of three runs, and fails past 1.2 times
// the kept time plus 50 ms (the rest is noise).
// A case is cases/NAME.mjs with a default export:
//   about     one line: what the job is and where it comes from
//   for       the drawing it starts in (File > New For): paper by default
//   brief     set_brief's arguments, the user's answers (plan 3.1): the job's first call, counted with the rest. By
//             default the destination is the drawing's page (a corpus job was drawn on a paper page). false: the job
//             gives them in its first draw call (draw's brief, plan 19.2), so there is no call for them
//   calls     [{ name, arguments }]: arguments may be a function of the results so far, for ids made earlier
//   expect    { smiles: { number: SMILES or InChIKey } }: each compound number's structure in the finished drawing
// corpus/PAPER.json holds jobs from one paper (corpus/README.md): each is a case of one call. A name on the command
// line runs that case, or every job of that paper. lines-JOB is the same job as the line notation writes it
// (lines.json, src/notation.check.ts): one draw call with the brief in it.
// Right counts those; Warnings is Octet's own count for the finished drawing (chemistry and layout). Summary is the
// characters of the finished drawing's default read (plan section 10: under 5,000 for the taxol figure).
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";

type Call = { name: string; arguments?: unknown | ((results: any[]) => unknown) };
type Case = { about: string; for?: string; brief?: object | false; calls: Call[]; expect?: { smiles?: Record<string, string> } };
type Measure = { calls: number; failed: number; coerced: number; sent: number; read: number; ms: number; slowest: number; right?: number; of?: number; warnings?: number; summary?: number };

// As draw.ts: Indigo's wasm as first compiled, so the process ends when the work does.
if (!process.execArgv.includes("--liftoff-only")) process.exit(spawnSync(process.execPath, ["--liftoff-only", ...process.execArgv, ...process.argv.slice(1)], { stdio: "inherit" }).status ?? 1);

const { load, drawing, session } = await import("../headless/host.ts");
const { handle } = await import("../../src/mcp.ts");
const { parseStructure, toInchiKey } = await import("../../src/chem.ts");
const here = new URL("./", import.meta.url), version = JSON.parse(readFileSync(new URL("../../package.json", here), "utf8")).version;
const argv = process.argv.slice(2), write = argv.includes("--write"), named = argv.filter((a) => a !== "--write");
// Every case by name: cases/NAME.mjs, and each job of corpus/PAPER.json (named PAPER-...).
const all = new Map<string, () => Promise<Case>>(readdirSync(new URL("cases/", here)).filter((f) => f.endsWith(".mjs")).map((f) => [f.slice(0, -4), async () => (await import(new URL(`cases/${f}`, here).href)).default]));
const lines: Record<string, string> = JSON.parse(readFileSync(new URL("lines.json", here), "utf8"));
for (const f of existsSync(new URL("corpus/", here)) ? readdirSync(new URL("corpus/", here)).filter((x) => x.endsWith(".json")) : [])
  for (const j of JSON.parse(readFileSync(new URL(`corpus/${f}`, here), "utf8")).jobs) {
    all.set(j.id, async () => ({ about: j.prompt, for: j.for, brief: j.brief, calls: [{ name: j.tool, arguments: j.arguments }], expect: j.expect }));
    const page = j.for ?? "paper";
    if (lines[j.id]) all.set(`lines-${j.id}`, async () => ({ about: `${j.prompt} (as lines)`, for: j.for, brief: false, calls: [{ name: "draw", arguments: { lines: lines[j.id], brief: j.brief ?? (page === "experiment" ? "notebook" : page) } }], expect: j.expect }));
    // A job of more than one step is a route too (plan 5.4): one draw_route call, its figure as the scheme's title.
    const { kind, start, steps } = j.arguments;
    if (kind === "reaction" && steps.length > 1) all.set(`route-${j.id}`, async () => ({ about: `${j.prompt} (as a route)`, for: j.for, brief: j.brief, calls: [{ name: "draw_route", arguments: { schemes: [{ title: j.figure, start, steps }] } }], expect: j.expect }));
  }
const keptTimes = Object.fromEntries(readdirSync(new URL("cases/", here)).map((f) => [f.slice(0, -4), true]));
const names = [...all.keys()].filter((n) => !named.length || named.some((x) => n === x || n.startsWith(`${x}-`))).sort();
await load();

const KEY = /^[A-Z]{14}-[A-Z]{10}-[A-Z]$/;
const keyOf = (text: string) => (KEY.test(text) ? text : toInchiKey(parseStructure(text)));

let runs = 0;
async function run(c: Case): Promise<Measure> {
  const d = drawing(c.for ?? "paper"), results: any[] = [], m: Measure = { calls: 0, failed: 0, coerced: 0, sent: 0, read: 0, ms: 0, slowest: 0 }, from = `bench-${++runs}`;
  const rpc = async (method: string, params?: unknown) => JSON.parse(await handle(JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), () => d.host, version, session("Octet bench", from)));
  // Each run is a new session, so it gives its brief first (results holds the job's own calls).
  const page = c.for ?? "paper", brief: Call = { name: "set_brief", arguments: c.brief || { destination: { kind: page === "experiment" ? "notebook" : page } } };
  for (const call of [...(c.brief === false ? [] : [brief]), ...c.calls]) {
    // A turn of the event loop between calls, as an AI app's calls come one at a time: Octet loads a fresh Indigo then
    // when the old one has failed 500 times (chem.ts), so every case runs in one process (plan 17.2).
    await new Promise((r) => setImmediate(r));
    const args = typeof call.arguments === "function" ? call.arguments(results) : (call.arguments ?? {}), t = performance.now();
    const r = await rpc("tools/call", { name: call.name, arguments: structuredClone(args) }), ms = performance.now() - t;
    // What the AI app reads: the text and any picture (structuredContent repeats the text's data).
    const content: { text?: string; data?: string }[] = r.result?.content ?? [{ text: r.error?.message }];
    if (call !== brief) results.push(r.result?.structuredContent ?? {});
    m.calls++; m.sent += JSON.stringify(args).length; m.read += content.reduce((n, x) => n + (x.text?.length ?? 0) + (x.data?.length ?? 0), 0);
    m.ms += ms; m.slowest = Math.max(m.slowest, ms);
    if (r.error || r.result?.isError) m.failed++;
    // The lenient readings come as lines of text after the result's own.
    m.coerced += content.slice(1).reduce((n, x) => n + (x.text?.split("\n").length ?? 0), 0);
  }
  // The finished drawing, read in full outside the job's count.
  const end = (await rpc("tools/call", { name: "read", arguments: { detail: "full" } })).result?.structuredContent;
  const want = Object.entries(c.expect?.smiles ?? {});
  if (want.length) [m.right, m.of] = [want.filter(([number, text]) => end?.structures?.some((s: any) => s.number === number && s.inchiKey === keyOf(text))).length, want.length];
  m.warnings = end?.warnings?.length;
  m.summary = (await rpc("tools/call", { name: "read", arguments: {} })).result?.content?.[0]?.text?.length;
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
console.log("| Case | Calls | Failed | Coerced | Sent | Read | Octet ms | Slowest call ms | Right | Warnings | Summary |\n|---|---|---|---|---|---|---|---|---|---|---|");
for (const [name, m] of Object.entries(now.cases)) {
  const was = kept?.cases[name], cell = (k: "calls" | "failed" | "coerced" | "sent" | "read" | "ms" | "slowest" | "warnings" | "summary") => (was && was[k] !== m[k] ? `${m[k]} (was ${was[k]})` : `${m[k] ?? ""}`);
  console.log(`| ${name} | ${cell("calls")} | ${cell("failed")} | ${cell("coerced")} | ${cell("sent")} | ${cell("read")} | ${cell("ms")} | ${cell("slowest")} | ${m.of ? `${m.right} of ${m.of}` : ""} | ${cell("warnings")} | ${cell("summary")} |`);
  for (const k of ["calls", "failed", "sent", "read", "warnings", "summary"] as const) than(`${name} ${k}`, m[k], was?.[k]);
  than(`${name} ms`, m.ms, was?.ms, (v) => v * 1.2 + 50);
  if ((m.right ?? 0) < (was?.right ?? 0)) worse.push(`${name} structures right: ${m.right}, was ${was?.right}`);
}
if (write) writeFileSync(file, JSON.stringify(kept && named.length ? { ...now, cases: { ...kept.cases, ...now.cases } } : now, null, 1) + "\n");
else for (const w of worse) console.error(`WORSE ${w}`);
process.exit(write || !worse.length ? 0 : 1);
