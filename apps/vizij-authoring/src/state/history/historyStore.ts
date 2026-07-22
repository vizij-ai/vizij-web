import { create } from "zustand";

/**
 * Snapshot-based undo/redo history over the authoring document stores.
 *
 * Scopes register a `capture`/`restore` pair for their undoable document
 * state. Mutations are reported via `notifyChange()`, debounced, and
 * committed as one history entry per settled burst — so a slider drag or a
 * multi-field import becomes a single undo step. Captured snapshots hold the
 * stores' own immutable references (every participating store updates
 * immutably), which keeps capture cheap and makes change detection a
 * reference comparison.
 *
 * Live-drive values (rig `inputValues`, pose `currentValues`) are
 * deliberately not part of any scope: timeline/graph playback writes them
 * every frame and would flood the history. Undo covers document edits —
 * bindings, inputs, poses, groups, stages, tracks, keyframes, graph
 * nodes/edges.
 */

export type HistorySnapshot = Record<string, unknown>;

export interface HistoryScope {
  /** Stable identifier, unique per scope (e.g. "rig", "animation-timeline"). */
  id: string;
  /** Capture the scope's undoable document state as immutable references. */
  capture: () => HistorySnapshot;
  /** Restore a previously captured snapshot into the underlying store. */
  restore: (snapshot: HistorySnapshot) => void;
}

interface HistoryEntry {
  snapshots: Record<string, HistorySnapshot>;
}

export interface HistoryStatus {
  canUndo: boolean;
  canRedo: boolean;
  undoDepth: number;
  redoDepth: number;
}

export interface HistoryManagerOptions {
  /** Maximum number of undoable entries kept (default 100). */
  capacity?: number;
  /** Trailing debounce applied to notifyChange bursts (default 400ms). */
  debounceMs?: number;
  /**
   * Window after a restore during which commits replace the present entry
   * instead of pushing a new one (default 4000ms). Restoring a snapshot
   * echoes asynchronously — React setters re-render, the rig graph
   * recompiles, derived drafts rebuild, sometimes with regenerated ids — and
   * those cascades can take seconds. An echo that committed as a real entry
   * would pollute undo and clear the redo stack, so the window must outlast
   * the recompile cascade. Known limitation: a genuine user edit made inside
   * the window right after an undo is absorbed into the present entry rather
   * than becoming its own undo step (the edit itself is never lost).
   */
  absorbAfterRestoreMs?: number;
  onStatusChange?: (status: HistoryStatus) => void;
}

export interface HistoryManager {
  registerScope: (scope: HistoryScope) => () => void;
  /** Report that a scope's document state changed; debounced into a commit. */
  notifyChange: () => void;
  /** Commit any pending debounced change immediately. */
  flush: () => void;
  undo: () => boolean;
  redo: () => boolean;
  /** Clear history and re-baseline from the current store state. */
  reset: () => void;
  getStatus: () => HistoryStatus;
}

/**
 * Structural equality over captured snapshots. Derived-state rebuilds
 * (auto-input reconciliation, pose draft projection) routinely produce
 * identity-new but content-equal store state; comparing by content keeps
 * those echoes from becoming history entries (which would pollute undo and
 * clear the redo stack). Runs once per settled burst, so the deep walk is
 * cheap in practice. Set members are compared by identity/value (`has`),
 * which is exact for the string sets the scopes use.
 */
export function deepValueEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }
  if (
    typeof left !== "object" ||
    typeof right !== "object" ||
    left === null ||
    right === null
  ) {
    return false;
  }
  if (left instanceof Map || right instanceof Map) {
    if (!(left instanceof Map) || !(right instanceof Map)) {
      return false;
    }
    if (left.size !== right.size) {
      return false;
    }
    for (const [key, value] of left) {
      if (!right.has(key) || !deepValueEqual(value, right.get(key))) {
        return false;
      }
    }
    return true;
  }
  if (left instanceof Set || right instanceof Set) {
    if (!(left instanceof Set) || !(right instanceof Set)) {
      return false;
    }
    if (left.size !== right.size) {
      return false;
    }
    for (const value of left) {
      if (!right.has(value)) {
        return false;
      }
    }
    return true;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) {
      return false;
    }
    if (left.length !== right.length) {
      return false;
    }
    for (let index = 0; index < left.length; index += 1) {
      if (!deepValueEqual(left[index], right[index])) {
        return false;
      }
    }
    return true;
  }
  const leftKeys = Object.keys(left as Record<string, unknown>);
  const rightKeys = Object.keys(right as Record<string, unknown>);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  for (const key of leftKeys) {
    if (
      !Object.prototype.hasOwnProperty.call(right, key) ||
      !deepValueEqual(
        (left as Record<string, unknown>)[key],
        (right as Record<string, unknown>)[key],
      )
    ) {
      return false;
    }
  }
  return true;
}

function snapshotsEqual(
  left: Record<string, HistorySnapshot>,
  right: Record<string, HistorySnapshot>,
): boolean {
  return deepValueEqual(left, right);
}

const DEFAULT_CAPACITY = 100;
const DEFAULT_DEBOUNCE_MS = 400;
const DEFAULT_ABSORB_MS = 4000;

export function createHistoryManager(
  options?: HistoryManagerOptions,
): HistoryManager {
  const capacity = options?.capacity ?? DEFAULT_CAPACITY;
  const debounceMs = options?.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const absorbAfterRestoreMs =
    options?.absorbAfterRestoreMs ?? DEFAULT_ABSORB_MS;

  const scopes = new Map<string, HistoryScope>();
  let past: HistoryEntry[] = [];
  let present: HistoryEntry | null = null;
  let future: HistoryEntry[] = [];
  let restoring = false;
  let absorbUntil = 0;
  let pendingTimer: ReturnType<typeof setTimeout> | null = null;

  const getStatus = (): HistoryStatus => ({
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    undoDepth: past.length,
    redoDepth: future.length,
  });

  const emitStatus = () => {
    options?.onStatusChange?.(getStatus());
  };

  const captureAll = (): HistoryEntry => {
    const snapshots: Record<string, HistorySnapshot> = {};
    scopes.forEach((scope, scopeId) => {
      snapshots[scopeId] = scope.capture();
    });
    return { snapshots };
  };

  const restoreAll = (entry: HistoryEntry) => {
    scopes.forEach((scope, scopeId) => {
      const snapshot = entry.snapshots[scopeId];
      if (snapshot) {
        scope.restore(snapshot);
      }
    });
  };

  const clearPendingTimer = () => {
    if (pendingTimer !== null) {
      clearTimeout(pendingTimer);
      pendingTimer = null;
    }
  };

  const commit = () => {
    if (restoring) {
      return;
    }
    clearPendingTimer();
    if (scopes.size === 0) {
      return;
    }
    const next = captureAll();
    if (present && snapshotsEqual(present.snapshots, next.snapshots)) {
      return;
    }
    if (present && Date.now() < absorbUntil) {
      present = next;
      return;
    }
    if (present) {
      past.push(present);
      if (past.length > capacity) {
        past = past.slice(past.length - capacity);
      }
    }
    present = next;
    future = [];
    emitStatus();
  };

  const notifyChange = () => {
    if (restoring || scopes.size === 0) {
      return;
    }
    clearPendingTimer();
    pendingTimer = setTimeout(commit, debounceMs);
  };

  const flush = () => {
    if (pendingTimer !== null) {
      commit();
    }
  };

  const undo = (): boolean => {
    flush();
    const target = past.pop();
    if (!target) {
      return false;
    }
    if (present) {
      future.unshift(present);
    }
    present = target;
    restoring = true;
    try {
      restoreAll(target);
    } finally {
      restoring = false;
    }
    absorbUntil = Date.now() + absorbAfterRestoreMs;
    emitStatus();
    return true;
  };

  const redo = (): boolean => {
    flush();
    const target = future.shift();
    if (!target) {
      return false;
    }
    if (present) {
      past.push(present);
    }
    present = target;
    restoring = true;
    try {
      restoreAll(target);
    } finally {
      restoring = false;
    }
    absorbUntil = Date.now() + absorbAfterRestoreMs;
    emitStatus();
    return true;
  };

  const reset = () => {
    clearPendingTimer();
    past = [];
    future = [];
    absorbUntil = 0;
    present = scopes.size > 0 ? captureAll() : null;
    emitStatus();
  };

  const registerScope = (scope: HistoryScope): (() => void) => {
    scopes.set(scope.id, scope);
    if (present) {
      present = {
        snapshots: {
          ...present.snapshots,
          [scope.id]: scope.capture(),
        },
      };
    } else {
      present = captureAll();
    }
    return () => {
      scopes.delete(scope.id);
      if (present && scope.id in present.snapshots) {
        const rest = { ...present.snapshots };
        delete rest[scope.id];
        present = { snapshots: rest };
      }
    };
  };

  return {
    registerScope,
    notifyChange,
    flush,
    undo,
    redo,
    reset,
    getStatus,
  };
}

/** Live undo/redo availability for UI (menu items, buttons). */
export const useHistoryStatus = create<HistoryStatus>(() => ({
  canUndo: false,
  canRedo: false,
  undoDepth: 0,
  redoDepth: 0,
}));

/** The application-wide history manager singleton. */
export const appHistory: HistoryManager = createHistoryManager({
  onStatusChange: (status) => useHistoryStatus.setState(status),
});
