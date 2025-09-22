/**
 * Lightweight graph store compatible with React's useSyncExternalStore.
 *
 * Provides:
 * - subscribe(listener): () => void
 * - getSnapshot(): T
 * - setSnapshot(next: T | ((prev: T) => T)): void
 * - getVersion(): number
 *
 * Designed to be small and dependency-free so it can be used inside the provider.
 */

export type Store<T> = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => T;
  setSnapshot: (next: T | ((prev: T) => T)) => void;
  getVersion: () => number;
};

export function createGraphStore<T>(initial: T): Store<T> {
  let snapshot: T = initial;
  let version = 0;
  const listeners = new Set<() => void>();

  function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  function getSnapshot() {
    return snapshot;
  }

  function getVersion() {
    return version;
  }

  function setSnapshot(next: T | ((prev: T) => T)) {
    const newSnapshot =
      typeof next === "function" ? (next as (p: T) => T)(snapshot) : next;
    // Simple equality check: if reference didn't change, don't notify.
    if (newSnapshot === snapshot) return;
    snapshot = newSnapshot;
    version += 1;
    // Notify listeners synchronously. Tests (and some consumers) expect immediate
    // notifications when snapshot updates (e.g., clearing writes). To avoid the
    // previous infinite-update issue we ensure callers reuse stable objects
    // (like EMPTY_WRITES) rather than allocating new arrays on every update.
    const copy = Array.from(listeners);
    for (const l of copy) {
      try {
        l();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("Graph store listener error:", err);
      }
    }
  }

  return {
    subscribe,
    getSnapshot,
    setSnapshot,
    getVersion,
  };
}
