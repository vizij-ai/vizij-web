import { useReducer, useRef, useEffect, useCallback } from "react";

type CollapsedState = Set<string>;

type Action =
  | { type: "toggle"; id: string }
  | { type: "set"; id: string; expanded: boolean }
  | { type: "sync"; ids: string[] };

function storageKey(namespace: string): string {
  return `vizij:scene-hierarchy:${namespace}`;
}

function readCollapsedState(key: string): CollapsedState {
  if (typeof window === "undefined") {
    return new Set();
  }
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return new Set();
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return new Set(
        parsed.filter((value): value is string => typeof value === "string"),
      );
    }
  } catch {
    // Ignore storage errors.
  }
  return new Set();
}

function persistCollapsedState(key: string, state: CollapsedState): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(
      key,
      JSON.stringify(Array.from(state.values())),
    );
  } catch {
    // Ignore storage errors.
  }
}

function reducer(state: CollapsedState, action: Action): CollapsedState {
  switch (action.type) {
    case "toggle": {
      const next = new Set(state);
      if (next.has(action.id)) {
        next.delete(action.id);
      } else {
        next.add(action.id);
      }
      return next;
    }
    case "set": {
      const next = new Set(state);
      if (action.expanded) {
        next.delete(action.id);
      } else {
        next.add(action.id);
      }
      if (next.size === state.size) {
        let identical = true;
        state.forEach((value) => {
          if (!next.has(value)) {
            identical = false;
          }
        });
        if (identical) {
          return state;
        }
      }
      return next;
    }
    case "sync": {
      const allowed = new Set(action.ids);
      const next = new Set<string>();
      let changed = false;
      state.forEach((value) => {
        if (allowed.has(value)) {
          next.add(value);
        } else {
          changed = true;
        }
      });
      if (!changed && next.size === state.size) {
        return state;
      }
      return next;
    }
    default:
      return state;
  }
}

export interface HierarchyTreeState {
  isExpanded: (id: string) => boolean;
  toggleNode: (id: string) => void;
  setExpanded: (id: string, expanded: boolean) => void;
}

export function useHierarchyTreeState(
  namespace: string,
  nodeIds: string[],
): HierarchyTreeState {
  const key = storageKey(namespace);
  const [collapsed, dispatch] = useReducer(reducer, undefined, () =>
    readCollapsedState(key),
  );
  const nodesRef = useRef<string[]>([]);

  useEffect(() => {
    persistCollapsedState(key, collapsed);
  }, [collapsed, key]);

  useEffect(() => {
    const previous = nodesRef.current;
    if (previous.length === nodeIds.length) {
      let identical = true;
      for (let index = 0; index < nodeIds.length; index += 1) {
        if (previous[index] !== nodeIds[index]) {
          identical = false;
          break;
        }
      }
      if (identical) {
        return;
      }
    }
    nodesRef.current = nodeIds;
    dispatch({ type: "sync", ids: nodeIds });
  }, [nodeIds]);

  const isExpanded = useCallback(
    (id: string) => !collapsed.has(id),
    [collapsed],
  );

  const toggleNode = useCallback((id: string) => {
    dispatch({ type: "toggle", id });
  }, []);

  const setExpanded = useCallback((id: string, expanded: boolean) => {
    dispatch({ type: "set", id, expanded });
  }, []);

  return {
    isExpanded,
    toggleNode,
    setExpanded,
  };
}
