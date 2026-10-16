// Name to structure, offline: OPSIN compiled to JavaScript (see tools/opsin). It loads in the background
// soon after start-up, so the first conversion is instant; until then nameToSmiles returns undefined.
import pack from "./vendor/opsin/opsin-data.bin?url";
import list from "./vendor/opsin/names.txt?url";

type Opsin = typeof import("./vendor/opsin/opsin.js");
let opsin: Opsin | undefined;
let names: string[] = []; // whole names OPSIN reads, sorted (see tools/opsin/names.mjs)
let loading: Promise<void> | undefined;

export function loadNames(): Promise<void> {
  loading ??= (async () => {
    const [mod, data, words] = await Promise.all([import("./vendor/opsin/opsin.js"), fetch(pack).then((r) => r.arrayBuffer()), fetch(list).then((r) => r.text())]);
    names = words.split("\n").filter(Boolean);
    // The pack: [name length (u16), name (latin1), size (i32), bytes] repeated, ending with a zero length.
    const view = new DataView(data), files = new Map<string, Int8Array>(), latin1 = new TextDecoder("latin1");
    for (let p = 0; ; ) {
      const n = view.getUint16(p); p += 2;
      if (!n) break;
      const name = latin1.decode(new Uint8Array(data, p, n)); p += n;
      const size = view.getInt32(p); p += 4;
      files.set(name, new Int8Array(data, p, size)); p += size;
    }
    (globalThis as { opsinResource?: (name: string) => Int8Array | null }).opsinResource = (name) => files.get(name) ?? null;
    mod.init();
    opsin = mod;
  })();
  return loading;
}

// SMILES for a chemical name, or undefined if OPSIN cannot read it (or has not loaded yet).
export function nameToSmiles(name: string): string | undefined {
  if (!opsin || !name.trim() || name.length > 1000) return undefined;
  try {
    return opsin.parseToSmiles(name.trim()) ?? undefined;
  } catch {
    return undefined;
  }
}

// A name close to what was typed, for when it is not a name OPSIN reads: the rest of a common name being
// typed ("phenylal" to phenylalanine), a common name spelt with up to a few mistakes ("phenylanaline"), or
// any name one keystroke away ("2-methlypropan-1-ol"). Every suggestion is one OPSIN reads.
// thorough: also try every name one keystroke away (30 to 90 ms), not just the list of common names.
export function suggestName(typed: string, thorough = true): string | undefined {
  const s = typed.trim(), lower = s.toLowerCase();
  if (!opsin || s.length < 3 || s.length > 80 || nameToSmiles(s)) return undefined;
  // The rest of a common name: the shortest one that starts with what was typed.
  let lo = 0, hi = names.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (names[mid] < lower) lo = mid + 1; else hi = mid; }
  let completion: string | undefined;
  for (let i = lo; i < names.length && names[i].startsWith(lower); i++) if (!completion || names[i].length < completion.length) completion = names[i];
  if (completion && lower.length >= 4) return completion;
  // A common name with a few mistakes: one for short names, up to three for long ones.
  const limit = lower.length <= 5 ? 1 : lower.length <= 12 ? 2 : 3;
  let best: string | undefined, bestDistance = limit + 1;
  for (const name of names) {
    if (Math.abs(name.length - lower.length) >= bestDistance) continue;
    const d = distance(lower, name, bestDistance);
    if (d < bestDistance) [best, bestDistance] = [name, d];
  }
  // A common name within two mistakes beats an uncommon name one keystroke away ("phenylanaline" is
  // phenylalanine, not phenylaniline).
  if (best && bestDistance <= 2) return best;
  if (!thorough) return undefined;
  // Any name one keystroke away. Swapped letters are the most common slip, then a wrong, missing or extra letter.
  return oneAway(s) ?? best;
}

const LETTERS = "abcdefghijklmnopqrstuvwxyz";
function oneAway(s: string): string | undefined {
  const tries: string[] = [];
  for (let i = 0; i + 1 < s.length; i++) tries.push(s.slice(0, i) + s[i + 1] + s[i] + s.slice(i + 2));
  for (let i = 0; i < s.length; i++) for (const c of LETTERS) if (c !== s[i]) tries.push(s.slice(0, i) + c + s.slice(i + 1));
  for (let i = 0; i < s.length; i++) tries.push(s.slice(0, i) + s.slice(i + 1));
  for (let i = 0; i <= s.length; i++) for (const c of LETTERS) tries.push(s.slice(0, i) + c + s.slice(i));
  return tries.find((t) => nameToSmiles(t));
}

// Edit distance with swaps of neighbouring letters (optimal string alignment). Stops early past max.
function distance(a: string, b: string, max: number): number {
  let prev2: number[] = [], prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let least = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let d = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d = Math.min(d, prev2[j - 2] + 1);
      row.push(d);
      least = Math.min(least, d);
    }
    if (least >= max) return max;
    [prev2, prev] = [prev, row];
  }
  return prev[b.length];
}
