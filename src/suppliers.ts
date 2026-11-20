// Find suppliers (issue 114): the suppliers PubChem lists for a structure, as the Suppliers window shows them. Rust
// reads PubChem's answer (src-tauri/src/pubchem.rs, pubchem_suppliers) and gives the page each supplier's name, a
// link it has checked, its catalogue numbers for the compound, how many products PubChem lists, and (from PubChem's
// source table) its country and how many substances it lists in PubChem; the page checks the shape again and shows
// names and numbers only as text. PubChem has no prices, pack sizes, purity, ratings or
// logos, so neither has this.
export type Supplier = { name: string; url: string; codes: string[]; products: number; country?: string; listed?: number };
// partial: PubChem's source table could not be had, so no country or count; the next Find suppliers asks again.
export type Suppliers = { cid: number; suppliers: Supplier[]; partial?: true };
// A structure's suppliers as far as they are found: null, PubChem has no compound for its key; "busy", being asked;
// error, why there is no answer (the structure has no key, no network, PubChem slow, Stop).
export type Found = Suppliers | null | "busy" | { error: string } | undefined;
// The two PubChem lookups Octet runs on a press (pubchem_stop's kinds).
export type Lookup = "suppliers" | "hazards";

const MOST = 1000, MOST_NAME = 120, MOST_CODES = 3, MOST_CODE = 40;
// The answer from Rust, or undefined when it has the wrong shape. null stays null (no compound).
export function suppliersOf(x: unknown): Suppliers | null | undefined {
  if (x === null) return null;
  if (!x || typeof x !== "object") return undefined;
  const { cid, suppliers } = x as { cid?: unknown; suppliers?: unknown };
  if (typeof cid !== "number" || !Number.isSafeInteger(cid) || cid < 1 || !Array.isArray(suppliers)) return undefined;
  const list = suppliers.slice(0, MOST).filter((s): s is Supplier => !!s && typeof s.name === "string" && typeof s.url === "string" && s.url.startsWith("https://") && !!s.name.trim())
    .map((s) => ({ name: s.name.slice(0, MOST_NAME), url: s.url,
      codes: Array.isArray(s.codes) ? s.codes.filter((c): c is string => typeof c === "string" && !!c.trim()).slice(0, MOST_CODES).map((c) => c.slice(0, MOST_CODE)) : [],
      products: Number.isSafeInteger(s.products) && s.products > 0 ? s.products : 1,
      ...(typeof s.country === "string" && s.country.trim() ? { country: s.country.slice(0, MOST_CODE * 2) } : {}),
      ...(Number.isSafeInteger(s.listed) && s.listed! >= 0 ? { listed: s.listed } : {}) }));
  return { cid, suppliers: list, ...((x as { partial?: unknown }).partial === true ? { partial: true as const } : {}) };
}

// A supplier's key for favourites: its name, letter case and spaces aside (as Rust counts each supplier once).
export const supplierKey = (name: string) => name.replace(/\s+/g, "").toLowerCase();
// The suppliers the window lists: those whose name, country or a catalogue number holds every word of the search
// (letter case aside), favourites first, then A to Z as Rust gave them.
export function shownSuppliers(list: Supplier[], favourites: string[], search: string): Supplier[] {
  const words = search.toLowerCase().split(/\s+/).filter(Boolean), fav = new Set(favourites);
  const hit = list.filter((s) => words.every((w) => s.name.toLowerCase().includes(w) || !!s.country?.toLowerCase().includes(w) || s.codes.some((c) => c.toLowerCase().includes(w))));
  return [...hit.filter((s) => fav.has(supplierKey(s.name))), ...hit.filter((s) => !fav.has(supplierKey(s.name)))];
}
// The favourites with this supplier starred or not.
export const starred = (favourites: string[], name: string, on: boolean) => {
  const key = supplierKey(name), rest = favourites.filter((k) => k !== key);
  return on ? [...rest, key] : rest;
};

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
// What the Suppliers window says for a lookup's error: each error in its own words, any other as no network.
export const lookupText = (e: string) => ([NO_KEY, SLOW, STOPPED, OFF].includes(e) ? e : UNREACHED_NOTICE);

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
