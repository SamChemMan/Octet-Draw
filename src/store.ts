// A value that changes many times a second (the view as it pans and zooms, the thing under the pointer). Parts of
// the page subscribe to it and draw again when it changes, so the rest of the editor does not. A value equal to the
// one held (by `same`) changes nothing.
export type Store<T> = { get: () => T; set: (value: T) => void; subscribe: (listener: () => void) => () => void };

export function store<T>(value: T, same: (a: T, b: T) => boolean = Object.is): Store<T> {
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (next) => {
      if (same(value, next)) return;
      value = next;
      for (const f of [...listeners]) f();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}

// Whether two sets hold the same things in the same order. A selection made again with the same things keeps its set
// (Editor's choose), so what follows the selection does not work again. The order counts: some of what follows reads
// the selection in order (the first labelled atom gives the label style buttons).
export const sameSet = <T>(a: Set<T>, b: Set<T>) => {
  if (a.size !== b.size) return false;
  const next = b.values();
  for (const x of a) if (next.next().value !== x) return false;
  return true;
};
