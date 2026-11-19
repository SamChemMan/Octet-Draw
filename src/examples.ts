// Octet's example drawings (issue 94): finished drawings to open, look at and take apart, each an Octet drawing made in
// Octet (scripts/gallery) with its picture. One list (examples/examples.json) for Home, the File menu (main.rs reads
// it too), the AI apps and the checks. A drawing is fetched when it is first opened, each from a file of its own, and
// a picture when its tile shows, so none of them slows Octet's start. An id selects from the list: nothing else.
import list from "./examples/examples.json";

export type Example = { id: string; name: string; kind: string };
export const EXAMPLES: readonly Example[] = list;
const texts = import.meta.glob<string>(["./examples/*.json", "!./examples/examples.json"], { query: "?raw", import: "default" });
const pictures = import.meta.glob<string>("./examples/*.svg", { query: "?url&no-inline", import: "default", eager: true });

export const exampleOf = (id: string) => EXAMPLES.find((x) => x.id === id);
export const examplePicture = (id: string) => pictures[`./examples/${id}.svg`];
// The example's drawing as text (Octet's own form, which parse reads with its checks), or why it cannot load.
export function exampleText(id: string): Promise<string> {
  const load = exampleOf(id) && texts[`./examples/${id}.json`];
  return load ? load() : Promise.reject(new Error(`Octet has no example ${id}.`));
}
// The example asked for last, and when (Date.now()), in every window: a held key's repeats go to the window the first
// request opened. Octet's windows share localStorage; what this window asked is used when it is newer, or when
// localStorage cannot be read or written.
type Asked = { id: string; at: number };
let asked: Asked = { id: "", at: 0 };
export function exampleAsked(next?: Asked): Asked {
  if (next) {
    asked = next;
    try { localStorage.setItem("octet.exampleAsked", JSON.stringify(next)); } catch { /* this window's own */ }
    return next;
  }
  try {
    const v = JSON.parse(localStorage.getItem("octet.exampleAsked") ?? "null");
    if (typeof v?.id === "string" && typeof v?.at === "number" && v.at > asked.at && v.at <= Date.now()) return { id: v.id, at: v.at };
  } catch { /* this window's own */ }
  return asked;
}
