// Structure to Name in a worker (naming.worker.ts) that Octet can stop, so a structure that is slow to name never holds
// the window. One worker, started soon after the drawing opens (warmNaming) and again after Stop or a late structure,
// does one request at a time, and Structure to Name's requests go
// before the screen reader's. The worker has NAMING.load ms to load the names engine, then NAMING.deadline ms for each
// request (ReShiki's limits). A request past its time, a request stopped while it runs, and a worker that fails end
// the worker, and the next request starts a new one. Without Worker (the Node checks) a request runs at once, in place,
// with the same code (namepart.ts).
// Ported from PR #155 by Prof. Dr. Stefan Schramm.
import type { OwnName } from "./names.ts";
import { nameMixture, namePart, type MixturePart, type NamedPart } from "./namepart.ts";
import type { NamingAsk } from "./naming.worker.ts";
import type { Mol } from "./render.ts";

export const NAMING = { load: 60_000, deadline: 15_000 };

// A request's end: its answer, or why there is none. late: past its time; stopped: cancelled; failed: the worker failed
// or did not load.
export type Outcome<T> = { done: true; answer: T } | { done: false; why: "late" | "stopped" | "failed" };
export type Request<T> = { result: Promise<Outcome<T>>; cancel: () => void };

// What the client needs of a Worker, so a check can give it a stand-in.
export type WorkerLike = { postMessage(message: unknown): void; terminate(): void; onmessage: ((e: MessageEvent) => void) | null; onerror: ((e: ErrorEvent) => void) | null };
let make: (() => WorkerLike) | undefined = typeof Worker === "undefined" ? undefined : () => new Worker(new URL("./naming.worker.ts", import.meta.url), { type: "module" });
// For the checks: the worker to start (undefined: run in place). Requests running or waiting fail.
export function setNamingWorker(f: (() => WorkerLike) | undefined) { broken(); make = f; }

type Job = { part?: Mol; mixture?: MixturePart[]; own: OwnName[]; background: boolean; done: (o: Outcome<unknown>) => void };
const queue: Job[] = [];
let worker: WorkerLike | undefined, loaded = false, sent: OwnName[] | undefined, running: Job | undefined, timer: ReturnType<typeof setTimeout> | undefined;

export const namingBusy = () => !!running || queue.length > 0;

// Loads the worker before the first request, so Structure to Name does not wait the 2 to 3 s the names engine takes to
// load. A worker that fails to load is not started again here.
export function warmNaming() { if (make && !worker) start(); }

// A structure's name (namepart.ts namePart). own: the user's own dictionary. background: the screen reader's.
export const askName = (part: Mol, own: OwnName[], background = false): Request<NamedPart> => ask({ part, own, background }, () => namePart(part));
// A grouped mixture's name (namepart.ts nameMixture).
export const askMixtureName = (mixture: MixturePart[], own: OwnName[]): Request<string | undefined> => ask({ mixture, own, background: false }, () => nameMixture(mixture));

function ask<T>(o: Omit<Job, "done">, here: () => T): Request<T> {
  if (!make) {
    let answer: Outcome<T>;
    try { answer = { done: true, answer: here() }; } catch { answer = { done: false, why: "failed" }; }
    return { result: Promise.resolve(answer), cancel: () => {} };
  }
  let job!: Job;
  const result = new Promise<Outcome<T>>((done) => { job = { ...o, done: done as Job["done"] }; });
  const at = o.background ? -1 : queue.findIndex((j) => j.background);
  queue.splice(at < 0 ? queue.length : at, 0, job);
  next();
  const cancel = () => {
    const k = queue.indexOf(job);
    if (k >= 0) { queue.splice(k, 1); job.done({ done: false, why: "stopped" }); }
    else if (running === job) { stop(); finish({ done: false, why: "stopped" }); warmNaming(); }
  };
  return { result, cancel };
}

// Ends the worker: the next request starts another.
function stop() {
  clearTimeout(timer);
  if (worker) { worker.onmessage = worker.onerror = null; worker.terminate(); }
  worker = undefined;
  loaded = false;
}
function finish(o: Outcome<unknown>) {
  const job = running;
  running = undefined;
  clearTimeout(timer);
  job?.done(o);
  next();
}
// The worker failed or did not load: the requests waiting fail too, so none waits in vain for another load.
function broken() {
  stop();
  const waiting = queue.splice(0);
  finish({ done: false, why: "failed" });
  for (const j of waiting) j.done({ done: false, why: "failed" });
}
const late = () => { stop(); finish({ done: false, why: "late" }); warmNaming(); };
function next() {
  if (running || !queue.length) return;
  const job = (running = queue.shift()!);
  if (!worker) start();
  else if (loaded) timer = setTimeout(late, NAMING.deadline);
  const own = job.own !== sent ? (sent = job.own) : undefined;
  worker!.postMessage((job.part ? { part: job.part, own } : { mixture: job.mixture!, own }) satisfies NamingAsk);
}
function start() {
  const w = make!();
  worker = w;
  loaded = false;
  sent = undefined;
  timer = setTimeout(broken, NAMING.load);
  w.onmessage = (e: MessageEvent) => {
    const data = e.data as { ready: boolean } | { answer: unknown };
    if ("ready" in data) {
      if (!data.ready) return broken();
      // Loaded: the request running now has its own time.
      loaded = true;
      clearTimeout(timer);
      if (running) timer = setTimeout(late, NAMING.deadline);
      return;
    }
    if (running) finish({ done: true, answer: data.answer });
  };
  w.onerror = () => broken();
}
