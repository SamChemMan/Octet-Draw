// Structure to Name away from the page (namingworker.ts), so a structure that is slow to name never holds the window.
// It loads Indigo and the names engine (OPSIN, the dictionary), says { ready } once (false when they do not load), then
// answers each request with namePart or nameMixture, the code the window runs (namepart.ts).
// Ported from PR #155 by Prof. Dr. Stefan Schramm.
import { ready } from "./chem.ts";
import { loadNames, setOwnNames, type OwnName } from "./names.ts";
import { nameMixture, namePart, type MixturePart } from "./namepart.ts";
import type { Mol } from "./render.ts";

// own: the user's own dictionary, sent only when it changes.
export type NamingAsk = { own?: OwnName[] } & ({ part: Mol } | { mixture: MixturePart[] });

const loading = Promise.all([ready, loadNames()]).then(() => true, () => false);
void loading.then((ok) => postMessage({ ready: ok }));

self.onmessage = async (e: MessageEvent<NamingAsk>) => {
  const ask = e.data;
  if (!(await loading)) return;
  if (ask.own) setOwnNames(ask.own);
  let answer: unknown;
  try { answer = "part" in ask ? namePart(ask.part) : nameMixture(ask.mixture); } catch { answer = "part" in ask ? { mol: ask.part } : undefined; }
  postMessage({ answer });
};
