// Projects on Home (decision 0003): a project is a list in Octet that points at drawings, as an album in Photos points
// at photos. The files stay where they are, a drawing can be in more than one project, and a project that goes takes
// no drawing with it. The store also keeps the thumbnails the user chose (src/thumbs.ts) and, for drawings in
// projects, a copy of their automatic picture (a recent drawing's picture goes when it leaves the recent list).
// The app keeps the store's text in home.json (src-tauri/src/home.rs), which lets a project take only drawings Octet
// may open already. Every function here gives a new store and never changes the one it is given.
// The store has a version. A later Octet that changes its shape reads version 1 and writes its own; this one reads
// nothing from a later version (and the app does not let it write over one).

export const STORE_VERSION = 1;
export const MAX_PROJECTS = 200, MAX_IN_PROJECT = 1000, MAX_NAME = 60, MAX_PATH = 4096;
export const UNTITLED = "Untitled project";

export type ProjectDrawing = { path: string; name: string; added: number }; // added: seconds since 1970
export type Project = { id: string; name: string; made: number; thumb?: string; drawings: ProjectDrawing[] };
export type Pictures = { own?: string; auto?: string }; // thumbnail ids: the user's, and Octet's copy of the drawing
export type HomeStore = { version: number; projects: Project[]; pictures: Record<string, Pictures> };
export type StoreProblem = "damaged" | "newer";

export const emptyStore = (): HomeStore => ({ version: STORE_VERSION, projects: [], pictures: {} });
const THUMB = /^[0-9a-f]{16}$/, ID = /^[\w-]{1,40}$/;
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const time = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
const thumbId = (v: unknown) => (typeof v === "string" && THUMB.test(v) ? v : undefined);
const pathOk = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length < MAX_PATH;

// A project's name as typed: no control characters, spaces closed up, 60 characters at most.
export const cleanName = (name: string) => name.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_NAME).trim();
// A drawing's name, from its file: the name without the folder or the extension.
export const drawingName = (path: string) => (path.split(/[\\/]/).pop() ?? path).replace(/\.(octet|oct|cdxml|cdx)$/i, "");
// A new project's id.
export const newId = () => crypto.randomUUID().replace(/-/g, "").slice(0, 16);

// A name no other project has (letter case aside): the name, or the name and the next free number.
export function freeName(store: HomeStore, name = UNTITLED): string {
  const taken = new Set(store.projects.map((p) => p.name.toLowerCase())), base = cleanName(name) || UNTITLED;
  for (let n = 1; ; n++) {
    const tried = n === 1 ? base : `${base.slice(0, MAX_NAME - String(n).length - 1)} ${n}`;
    if (!taken.has(tried.toLowerCase())) return tried;
  }
}

// The store from home.json's text: empty for no file, and empty with a problem for a file that is damaged or from a
// later Octet. Each part that is wrong is left out on its own, so one bad entry loses only that entry.
export function readStore(text: string | null | undefined): { store: HomeStore; problem?: StoreProblem } {
  if (!text) return { store: emptyStore() };
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { store: emptyStore(), problem: "damaged" }; }
  if (!isObject(raw) || typeof raw.version !== "number" || !Array.isArray(raw.projects)) return { store: emptyStore(), problem: "damaged" };
  if (raw.version > STORE_VERSION) return { store: emptyStore(), problem: "newer" };
  const ids = new Set<string>(), projects: Project[] = [];
  for (const p of raw.projects) {
    if (!isObject(p) || typeof p.id !== "string" || !ID.test(p.id) || ids.has(p.id) || typeof p.name !== "string" || !cleanName(p.name)) continue;
    ids.add(p.id);
    const seen = new Set<string>(), drawings: ProjectDrawing[] = [];
    for (const d of Array.isArray(p.drawings) ? p.drawings : []) {
      if (!isObject(d) || !pathOk(d.path) || seen.has(d.path)) continue;
      seen.add(d.path);
      drawings.push({ path: d.path, name: typeof d.name === "string" && d.name ? d.name.slice(0, 512) : drawingName(d.path), added: time(d.added) });
    }
    const thumb = thumbId(p.thumb);
    projects.push({ id: p.id, name: cleanName(p.name), made: time(p.made), ...(thumb ? { thumb } : {}), drawings: drawings.slice(0, MAX_IN_PROJECT) });
  }
  const pictures: Record<string, Pictures> = {};
  for (const [path, v] of Object.entries(isObject(raw.pictures) ? raw.pictures : {})) {
    if (!pathOk(path) || !isObject(v)) continue;
    const own = thumbId(v.own), auto = thumbId(v.auto);
    if (own || auto) pictures[path] = { ...(own ? { own } : {}), ...(auto ? { auto } : {}) };
  }
  return { store: { version: STORE_VERSION, projects: projects.slice(0, MAX_PROJECTS), pictures } };
}

export const writeStore = (store: HomeStore) => JSON.stringify({ ...store, version: STORE_VERSION });

const change = (store: HomeStore, id: string, f: (p: Project) => Project): HomeStore => ({ ...store, projects: store.projects.map((p) => (p.id === id ? f(p) : p)) });
export const projectOf = (store: HomeStore, id: string | undefined) => store.projects.find((p) => p.id === id);
// The projects a drawing is in.
export const projectsWith = (store: HomeStore, path: string) => store.projects.filter((p) => p.drawings.some((d) => d.path === path));
export const canCreate = (store: HomeStore) => store.projects.length < MAX_PROJECTS;

// A new project, after the others. With no name, or a name another project has, it takes a free one.
export function createProject(store: HomeStore, name: string, id: string, now: number): HomeStore {
  if (!canCreate(store) || store.projects.some((p) => p.id === id)) return store;
  return { ...store, projects: [...store.projects, { id, name: freeName(store, name), made: now, drawings: [] }] };
}

// A project's new name. An empty name changes nothing; a name another project has takes the next free one.
export function renameProject(store: HomeStore, id: string, name: string): HomeStore {
  const clean = cleanName(name), p = projectOf(store, id);
  if (!p || !clean || clean === p.name) return store;
  const others = { ...store, projects: store.projects.filter((x) => x.id !== id) };
  return change(store, id, (x) => ({ ...x, name: freeName(others, clean) }));
}

// A project goes; its drawings stay where they are. drop: thumbnails nothing uses any more (its own, and the
// automatic pictures of drawings in no other project).
export function deleteProject(store: HomeStore, id: string): { store: HomeStore; drop: string[] } {
  const p = projectOf(store, id);
  if (!p) return { store, drop: [] };
  let next: HomeStore = { ...store, projects: store.projects.filter((x) => x.id !== id) };
  const drop = p.thumb ? [p.thumb] : [];
  for (const d of p.drawings) {
    const auto = next.pictures[d.path]?.auto;
    if (!auto || projectsWith(next, d.path).length) continue;
    next = { ...next, pictures: withPictures(next.pictures, d.path, { own: next.pictures[d.path].own }) };
    drop.push(auto);
  }
  return { store: next, drop };
}

// Drawings into a project, after those in it; one in it already stays where it is. added: how many went in.
export function addDrawings(store: HomeStore, id: string, drawings: { path: string; name?: string }[], now: number): { store: HomeStore; added: number } {
  const p = projectOf(store, id);
  if (!p) return { store, added: 0 };
  const have = new Set(p.drawings.map((d) => d.path)), fresh: ProjectDrawing[] = [];
  for (const d of drawings) {
    if (!pathOk(d.path) || have.has(d.path) || p.drawings.length + fresh.length >= MAX_IN_PROJECT) continue;
    have.add(d.path);
    fresh.push({ path: d.path, name: d.name || drawingName(d.path), added: now });
  }
  return { store: fresh.length ? change(store, id, (x) => ({ ...x, drawings: [...x.drawings, ...fresh] })) : store, added: fresh.length };
}

// A drawing out of a project (the file stays). drop: its automatic picture, when no other project has the drawing.
export function removeDrawing(store: HomeStore, id: string, path: string): { store: HomeStore; drop: string[] } {
  const next = change(store, id, (p) => ({ ...p, drawings: p.drawings.filter((d) => d.path !== path) }));
  const auto = next.pictures[path]?.auto;
  if (!auto || projectsWith(next, path).length) return { store: next, drop: [] };
  return { store: { ...next, pictures: withPictures(next.pictures, path, { own: next.pictures[path].own }) }, drop: [auto] };
}

// The pictures with a drawing's set to p (and no entry when p has neither).
const withPictures = (all: Record<string, Pictures>, path: string, p: Pictures) => {
  const next = { ...all };
  if (p.own || p.auto) next[path] = { ...(p.own ? { own: p.own } : {}), ...(p.auto ? { auto: p.auto } : {}) }; else delete next[path];
  return next;
};

// A drawing that moved (Locate…): its new place in every project, with its thumbnails. A project that has the new
// place already keeps that one entry.
export function relocate(store: HomeStore, from: string, to: string): { store: HomeStore; drop: string[] } {
  if (from === to || !pathOk(to)) return { store, drop: [] };
  const projects = store.projects.map((p) => {
    if (!p.drawings.some((d) => d.path === from)) return p;
    const there = p.drawings.some((d) => d.path === to);
    return { ...p, drawings: there ? p.drawings.filter((d) => d.path !== from) : p.drawings.map((d) => (d.path === from ? { ...d, path: to, name: drawingName(to) } : d)) };
  });
  const old = store.pictures[from], kept = store.pictures[to];
  if (!old) return { store: { ...store, projects }, drop: [] };
  const merged = { ...old, ...kept }, drop = [old.own, old.auto].filter((t) => t && t !== merged.own && t !== merged.auto) as string[];
  return { store: { ...store, projects, pictures: withPictures(withPictures(store.pictures, from, {}), to, merged) }, drop };
}

// A thumbnail for a drawing: the user's own (Set Thumbnail…), or Octet's copy of its automatic picture. drop: the
// thumbnail it takes the place of.
export function setPicture(store: HomeStore, path: string, which: keyof Pictures, id: string): { store: HomeStore; drop: string[] } {
  if (!pathOk(path) || !THUMB.test(id)) return { store, drop: [] };
  const was = store.pictures[path]?.[which];
  return { store: { ...store, pictures: withPictures(store.pictures, path, { ...store.pictures[path], [which]: id }) }, drop: was && was !== id ? [was] : [] };
}

// Use Automatic Thumbnail: the user's own thumbnail goes.
export function resetPicture(store: HomeStore, path: string): { store: HomeStore; drop: string[] } {
  const was = store.pictures[path]?.own;
  if (!was) return { store, drop: [] };
  return { store: { ...store, pictures: withPictures(store.pictures, path, { auto: store.pictures[path].auto }) }, drop: [was] };
}

// A project's own thumbnail, or (with none) its mosaic again.
export function setProjectThumb(store: HomeStore, id: string, thumb: string | undefined): { store: HomeStore; drop: string[] } {
  const p = projectOf(store, id);
  if (!p || (thumb !== undefined && !THUMB.test(thumb))) return { store, drop: [] };
  const next = change(store, id, (x) => ({ id: x.id, name: x.name, made: x.made, ...(thumb ? { thumb } : {}), drawings: x.drawings }));
  return { store: next, drop: p.thumb && p.thumb !== thumb ? [p.thumb] : [] };
}

// A drawing removed from Home's recent drawings: when no project has it, its thumbnails go too, so the store does not
// keep pictures of drawings Home no longer shows.
export function forget(store: HomeStore, path: string): { store: HomeStore; drop: string[] } {
  const p = store.pictures[path];
  if (!p || projectsWith(store, path).length) return { store, drop: [] };
  return { store: { ...store, pictures: withPictures(store.pictures, path, {}) }, drop: [p.own, p.auto].filter(Boolean) as string[] };
}

// Every thumbnail the store uses, to load.
export const thumbIds = (store: HomeStore) => [...store.projects.flatMap((p) => (p.thumb ? [p.thumb] : [])), ...Object.values(store.pictures).flatMap((p) => [p.own, p.auto].filter(Boolean) as string[])];

// A project's mosaic: the pictures of its first four drawings that have one.
export const mosaic = <T,>(p: Project, picture: (path: string) => T | undefined): T[] => p.drawings.flatMap((d) => { const t = picture(d.path); return t === undefined ? [] : [t]; }).slice(0, 4);
