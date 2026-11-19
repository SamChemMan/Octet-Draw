// Run: node src/namingworker.check.ts [all]. Structure to Name in a worker (namingworker.ts, naming.worker.ts,
// namepart.ts). 1. namePart, the code the worker and the window both run, gives byte for byte the names Editor.tsx gave
// in 1.1.3 (its code kept below as it was), on a spread of the naming set (OPSIN's names.txt, Octet's common and drug
// names; "all" runs every one). 2. The window's part of a request (a structured copy of the structure) costs far less
// than naming it. 3. The client: answers through a stand-in worker equal namePart's; a request past its time ends the
// worker and answers late, and the next request starts a new worker; Stop ends a running request or drops a waiting
// one; a worker that does not load or fails fails every waiting request; Structure to Name's requests go before the
// screen reader's; the user's dictionary is sent only when it changes. Node has no Worker: the real worker runs in the app.
// Ported from PR #155 by Prof. Dr. Stefan Schramm.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Mol } from "./render.ts";
import { browser, loadOpsin, needOpsin, opsinDir } from "../scripts/checkkit.ts";

needOpsin("namingworker.check: skipped (no OPSIN build)");
browser();
const chem = await import("./chem.ts");
await chem.ready;
const opsin = await loadOpsin();
const json = (file: string) => JSON.parse(readFileSync(new URL(file, import.meta.url), "utf8"));
const { DRUGS } = await import("./drugs.ts");
const { COMMON } = await import("./common.ts");
const words = readFileSync(new URL("names.txt", opsinDir), "utf8");
const { abbreviationOf, attachOpsin, knownName, nameToSmiles, setOwnNames } = await import("./names.ts");
attachOpsin(opsin, words, json("./nameindex.json"), DRUGS, json("./abbreviations.json"));
// namepart.ts sets up the namers, as Editor.tsx did at the top.
const { namePart, nameMixture, inchiOf } = await import("./namepart.ts");
const { checkedName, withAbbreviation } = await import("./naming.ts");
const { sandwichIons } = await import("./metals.ts");
const { mixtureName } = await import("./mixtures.ts");
const W = await import("./namingworker.ts");

// ——— 1. The same names as 1.1.3 ———
// Editor.tsx namedPart in 1.1.3, the naming itself, line for line.
const before = (part: Mol) => {
  let bare: string | undefined;
  const p = sandwichIons(part) ?? part;
  try { bare = checkedName(p, chem.expandLabels(p), nameToSmiles, inchiOf, chem.cipOf, knownName); } catch { bare = undefined; }
  return { bare, name: bare && withAbbreviation(bare, abbreviationOf(inchiOf(p))), mol: p };
};
const inputs = [...new Set([...words.split("\n").map((s) => s.trim()).filter(Boolean), ...Object.values(COMMON).filter((v) => !v.startsWith("smiles:")), ...Object.keys(DRUGS)])];
const all = process.argv[2] === "all", step = all ? 1 : Math.ceil(inputs.length / 150);
const mols: Mol[] = [];
let named = 0, naming = 0;
for (let k = 0; k < inputs.length; k += step) {
  const smiles = nameToSmiles(inputs[k]);
  if (!smiles) continue;
  let m: Mol;
  try { m = chem.parseStructure(smiles); } catch { continue; }
  const a = before(m), t = performance.now(), b = namePart(m);
  naming += performance.now() - t;
  assert.equal(JSON.stringify(b), JSON.stringify(a), inputs[k]);
  mols.push(m);
  if (b.name) named++;
}
assert.ok(mols.length >= (all ? 6000 : 120), `compared ${mols.length}`);
assert.ok(named > mols.length * 0.8, `named ${named} of ${mols.length}`);
console.log(`namingworker.check: ${mols.length} structures named as in 1.1.3 (${named} named), ${Math.round(naming)} ms to name`);
// The abbreviation after the name, and the user's own dictionary, as the editor gives them.
const tren = chem.parseStructure(nameToSmiles("TREN")!);
assert.equal(namePart(tren).name, "N1,N1-bis(2-aminoethyl)ethane-1,2-diamine (TREN)");
setOwnNames([{ name: "My amine", smiles: "NCCN(CCN)CCN", inchi: inchiOf(tren) }]);
assert.equal(namePart(tren).name, "N1,N1-bis(2-aminoethyl)ethane-1,2-diamine (My amine)");
setOwnNames([]);
// A mixture's name, as mixtureName gives it.
const water = chem.parseStructure("O"), ethanol = chem.parseStructure("CCO");
const mix = [{ name: namePart(ethanol).bare!, mol: ethanol, count: 1 }, { name: namePart(water).bare!, mol: water, count: 1 }];
assert.equal(nameMixture(mix), mixtureName(mix, nameToSmiles, inchiOf));
assert.ok(nameMixture(mix)?.includes("ethanol"));

// ——— 2. The window's part ———
// postMessage makes a structured copy of the structure; the answer comes back the same way. Both together cost the
// window far less than naming in it did (1.1.3).
let copying = 0;
for (const m of mols) { const t = performance.now(); structuredClone(structuredClone(m)); copying += performance.now() - t; }
for (const m of mols) assert.equal(JSON.stringify(namePart(structuredClone(m))), JSON.stringify(namePart(m)), "a copied structure names the same");
assert.ok(copying < naming / 10, `copying ${copying.toFixed(1)} ms, naming ${naming.toFixed(1)} ms`);
console.log(`namingworker.check: the window copies them in ${copying.toFixed(1)} ms`);

// ——— 3. The client ———
// Without Worker, each request runs at once with namePart.
assert.equal(typeof Worker, "undefined");
const here = await W.askName(tren, []).result;
assert.ok(here.done && JSON.stringify(here.answer) === JSON.stringify(namePart(tren)));

// A stand-in worker. It loads after `load` ms (never when undefined; ready false when bad), then answers each request
// as naming.worker.ts does, through a structured copy, after `takes` ms (never for an empty structure: stuck).
type Fake = { posted: { own?: unknown[] }[]; ended: boolean; fail: () => void };
const made: Fake[] = [];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function fakes(o: { load?: number; bad?: boolean; takes?: number } = {}) {
  W.setNamingWorker(() => {
    const f: Fake = { posted: [], ended: false, fail: () => {} };
    let ready = false, busy = false;
    const queue: unknown[] = [];
    const w: import("./namingworker.ts").WorkerLike = {
      onmessage: null, onerror: null,
      postMessage(m) { f.posted.push(structuredClone(m) as Fake["posted"][number]); queue.push(m); pump(); },
      terminate() { f.ended = true; },
    };
    const send = (data: unknown) => { if (!f.ended) w.onmessage?.({ data: structuredClone(data) } as MessageEvent); };
    const pump = () => {
      if (!ready || busy || !queue.length) return;
      const ask = structuredClone(queue.shift()!) as { part?: Mol; mixture?: typeof mix };
      busy = true;
      if (ask.part?.atoms.length === 0) return;
      setTimeout(() => { busy = false; send({ answer: ask.part ? namePart(ask.part) : nameMixture(ask.mixture!) }); pump(); }, o.takes ?? 1);
    };
    if (o.load !== undefined) setTimeout(() => { send({ ready: !o.bad }); ready = !o.bad; pump(); }, o.load);
    f.fail = () => w.onerror?.({} as ErrorEvent);
    made.push(f);
    return w;
  });
}
const stuck: Mol = { atoms: [], bonds: [] };
assert.deepEqual(W.NAMING, { load: 60_000, deadline: 15_000 });
W.NAMING.load = 200;
W.NAMING.deadline = 100;

// Answers through the worker equal namePart's, after it has loaded; one worker serves them all. The user's dictionary
// goes with the first request and again only when it changes.
fakes({ load: 20 });
const mine = [{ name: "My amine", smiles: "NCCN(CCN)CCN", inchi: inchiOf(tren) }];
const viaWorker = await Promise.all([tren, water, ethanol].map((m) => W.askName(m, mine).result));
viaWorker.forEach((o, k) => assert.ok(o.done && JSON.stringify(o.answer) === JSON.stringify(namePart([tren, water, ethanol][k]))));
assert.equal(made.length, 1);
assert.deepEqual(made[0].posted.map((p) => p.own?.length), [1, undefined, undefined]);
await W.askName(water, []).result;
assert.deepEqual(made[0].posted.at(-1)!.own, [], "a changed dictionary is sent");
assert.equal(W.namingBusy(), false);

// A request past its time: the worker ends and the answer is late; the next request starts a new worker and is answered.
made.length = 0;
fakes({ load: 5 });
let t = performance.now();
const slow = await W.askName(stuck, []).result;
assert.deepEqual(slow, { done: false, why: "late" });
assert.ok(performance.now() - t >= 95 && performance.now() - t < 1000, "past the deadline, not before");
assert.ok(made[0].ended, "the worker is ended");
const after = await W.askName(water, []).result;
assert.ok(after.done && after.answer.bare === "water");
assert.equal(made.length, 2, "a new worker");
assert.deepEqual(made[1].posted[0].own, [], "a new worker gets the dictionary");
// A request that waits behind a stuck one gets its own full time once it runs.
const [r1, r2] = [W.askName(stuck, []), W.askName(ethanol, [])];
assert.deepEqual(await r1.result, { done: false, why: "late" });
const o2 = await r2.result;
assert.ok(o2.done && o2.answer.bare === "ethanol");

// Stop: a running request ends with its worker; a waiting one is dropped and its worker is kept.
made.length = 0;
fakes({ load: 5, takes: 50 });
const run = W.askName(stuck, []), wait = W.askName(water, []), then = W.askName(ethanol, []);
await sleep(30);
wait.cancel();
assert.deepEqual(await wait.result, { done: false, why: "stopped" });
assert.equal(made[0].ended, false, "dropping a waiting request keeps the worker");
run.cancel();
assert.deepEqual(await run.result, { done: false, why: "stopped" });
assert.ok(made[0].ended, "stopping the running request ends its worker");
const o3 = await then.result;
assert.ok(o3.done && o3.answer.bare === "ethanol", "the next request still answers, in a new worker");
assert.equal(made.length, 2);
run.cancel(); // after the answer: nothing

// Structure to Name's requests go before the screen reader's waiting ones.
made.length = 0;
fakes({ load: 5 });
const order: string[] = [];
const bg = [W.askName(water, [], true), W.askName(ethanol, [], true)], fg = W.askName(tren, []);
await Promise.all([...bg, fg].map((r, k) => r.result.then(() => order.push(["water", "ethanol", "tren"][k]))));
assert.deepEqual(order, ["water", "tren", "ethanol"], "the first background request had started; tren goes next");

// A worker that never loads: the running and the waiting requests fail after the load time, not the request time.
made.length = 0;
fakes({});
t = performance.now();
const [n1, n2] = [W.askName(water, []), W.askName(ethanol, [])];
assert.deepEqual(await n1.result, { done: false, why: "failed" });
assert.deepEqual(await n2.result, { done: false, why: "failed" });
assert.ok(performance.now() - t >= 195, "the load time");
assert.ok(made[0].ended);
// One that cannot load (ready false) fails at once; one that fails while it works fails its requests too.
made.length = 0;
fakes({ load: 5, bad: true });
assert.deepEqual(await W.askName(water, []).result, { done: false, why: "failed" });
fakes({ load: 5, takes: 50 });
const e1 = W.askName(water, []), e2 = W.askName(ethanol, []);
await sleep(20);
made.at(-1)!.fail();
assert.deepEqual(await e1.result, { done: false, why: "failed" });
assert.deepEqual(await e2.result, { done: false, why: "failed" });
// Afterwards a new worker answers.
const o4 = await W.askMixtureName(mix, []).result;
assert.ok(o4.done && o4.answer === nameMixture(mix));
W.setNamingWorker(undefined);
assert.equal(W.namingBusy(), false);

console.log("namingworker.check: passed");
