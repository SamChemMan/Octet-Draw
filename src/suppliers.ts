// Find suppliers (issue 114): the suppliers PubChem lists for a structure, as the Properties panel shows them. Rust
// reads PubChem's answer (src-tauri/src/pubchem.rs, pubchem_suppliers) and gives the page each supplier's name and a
// link it has checked; the page checks the shape again and shows names only as text. PubChem has no prices, pack
// sizes or purity, so neither has this.
import { PROPERTY_ROWS, type PropertyValues } from "./proprows.ts";

export type Supplier = { name: string; url: string };
export type Suppliers = { cid: number; suppliers: Supplier[] };
// A structure's suppliers as far as they are found: null, PubChem has no compound for its key; "busy", being asked.
export type Found = Suppliers | null | "busy" | undefined;
// The two PubChem lookups the Properties panel runs on a press (pubchem_stop's kinds).
export type Lookup = "suppliers" | "hazards";

const MOST = 1000, MOST_NAME = 120;
// The answer from Rust, or undefined when it has the wrong shape. null stays null (no compound).
export function suppliersOf(x: unknown): Suppliers | null | undefined {
  if (x === null) return null;
  if (!x || typeof x !== "object") return undefined;
  const { cid, suppliers } = x as { cid?: unknown; suppliers?: unknown };
  if (typeof cid !== "number" || !Number.isSafeInteger(cid) || cid < 1 || !Array.isArray(suppliers)) return undefined;
  const list = suppliers.slice(0, MOST).filter((s): s is Supplier => !!s && typeof s.name === "string" && typeof s.url === "string" && s.url.startsWith("https://") && !!s.name.trim())
    .map((s) => ({ name: s.name.slice(0, MOST_NAME), url: s.url }));
  return { cid, suppliers: list };
}

// The Suppliers row's text for a structure.
export function suppliersText(f: Found): string | undefined {
  if (f === undefined) return undefined;
  if (f === "busy") return "Searching PubChem";
  const n = f?.suppliers.length ?? 0;
  return !n ? "No suppliers in PubChem" : n === 1 ? "1 supplier" : `${n} suppliers`;
}

// The values with the Suppliers row filled in, one value for each structure, and the PubChem CID row given the CID
// either lookup found. No row when no structure has been looked up.
export function withSuppliers(values: PropertyValues, found: Found[]): PropertyValues {
  const count = values.flat()[0]?.values.length ?? 0, text = Array.from({ length: count }, (_, k) => suppliersText(found[k]));
  if (!text.some((t) => t !== undefined)) return values;
  const at = PROPERTY_ROWS.findIndex((g) => g.some((r) => r.key === "suppliers")), had = values[at];
  const cid = (k: number) => { const f = found[k]; return f && f !== "busy" ? String(f.cid) : undefined; };
  return values.map((g, i) => (i !== at ? g : PROPERTY_ROWS[at].flatMap((r) => {
    if (r.key === "suppliers") return [{ ...r, values: text }];
    const row = had.find((x) => x.key === r.key);
    if (r.key !== "cid") return row ? [row] : [];
    const cids = Array.from({ length: count }, (_, k) => row?.values[k] ?? cid(k));
    return cids.some(Boolean) ? [{ ...(row ?? r), values: cids }] : [];
  })));
}

// What the user is told when a lookup cannot run or fails. Stopped: nothing.
export const offNotice = (kind: Lookup) => `To find ${kind}, turn on Online search in Settings.`;
export const UNREACHED_NOTICE = "Octet cannot reach PubChem. Check the network connection.";
// PubChem's time ran out (a common reagent's list of sources is large): said as Rust gives it (pubchem.rs SLOW).
export const SLOW = "PubChem is slow to answer. Try again later.";
export const NO_KEY = "PubChem cannot look up this structure.";
// The notice for a lookup's error.
export const failedNotice = (e: string) => (e === SLOW ? SLOW : UNREACHED_NOTICE);
export const STOPPED = "Stopped.";
export const OFF = "Online search is off in Settings.";

// The keys a lookup asks for: each once, none found before (kept), in the panel's order.
export const wanted = (keys: (string | undefined)[], kept: { has: (key: string) => boolean }) => [...new Set(keys)].filter((k): k is string => !!k && !kept.has(k));
// Asks for each key in turn while the run is live (Stop ends it). The first error that is not Stop ends it too, and is
// returned, so no network gives one notice, not one for each structure.
export async function askEach(keys: string[], ask: (key: string) => Promise<string | undefined>, live: () => boolean): Promise<string | undefined> {
  for (const key of keys) {
    if (!live()) return undefined;
    const e = await ask(key);
    if (e && e !== STOPPED) return e;
  }
  return undefined;
}
