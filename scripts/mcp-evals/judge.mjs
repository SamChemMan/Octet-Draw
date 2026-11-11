// Checks a finished lean job (brief.mjs): node scripts/mcp-evals/judge.mjs JOB [ANSWER_FILE]. Reads the job's drawing
// in its session, runs the job's checks (structures by InChIKey, worked out here with Octet's own chemistry), and prints
// one JSON line: pass, each check, calls, refused calls, characters sent and read, and seconds from the brief to the
// last call.
import { existsSync, readFileSync } from "node:fs";
import { connect } from "./octet.mjs";
import { SPEED } from "./speed.mjs";

const [id, answerFile] = process.argv.slice(2), at = new URL(`out/lean/${id}`, import.meta.url), job = SPEED.find((c) => c.id === id);
if (!job) throw new Error(`No job ${id}.`);
const s = JSON.parse(readFileSync(new URL(`${at}.json`), "utf8"));
if (s.info) process.env.OCTET_MCP_INFO ??= s.info;
// The drawing first: the headless host takes fetch over (it reaches no network).
const d = await (await connect("octet-lean-judge", s.session)).read();
const { load } = await import("../headless/host.ts"), { parseStructure, toInchiKey } = await import("../../src/chem.ts");
await load();
const key = (smiles) => toInchiKey(parseStructure(smiles)), loose = (smiles) => key(smiles).split("-")[0];
const answer = answerFile && existsSync(answerFile) ? readFileSync(answerFile, "utf8") : "";
const checks = d ? job.check({ d, answer, key, loose }).map(([ok, what, found]) => ({ ok: !!ok, what, ...(ok ? {} : { found }) })) : [{ ok: false, what: "the drawing is there", found: "no session" }];
const calls = readFileSync(new URL(`${at}.calls.jsonl`), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)), sum = (k) => calls.reduce((t, c) => t + c[k], 0);
console.log(JSON.stringify({ job: id, kind: job.kind, pass: checks.every((c) => c.ok), calls: calls.length, refused: calls.filter((c) => c.refused).length, sent: sum("sent"), read: sum("read"), seconds: calls.length ? Math.round((calls.at(-1).at - s.started) / 1000) : 0, checks }));
process.exit(0);
