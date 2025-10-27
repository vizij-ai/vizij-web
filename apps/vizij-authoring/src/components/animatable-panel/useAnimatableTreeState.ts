import { useCallback, useEffect, useReducer, useRef } from "react";
import type { TreeNodeType } from "./types";

type CollapsedState = Set<string>;

type Action =
  | { type: "toggle"; key: string }
  | { type: "set"; key: string; expanded: boolean }
  | { type: "sync"; keys: string[]; previousKeys: string[] };

function makeStorageKey(namespace: string): string {
  return `vizij:feature-tree:${namespace}`;
}

function readCollapsedKeys(storageKey: string): CollapsedState {
  if (typeof window === "undefined") {
    return new Set();
  }
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return new Set();
    }
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return new Set(parsed.filter((item) => typeof item === "string"));
    }
  } catch {
    // Ignore storage read errors.
  }
  return new Set();
}

function persistCollapsedKeys(storageKey: string, state: CollapsedState): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify(Array.from(state.values())),
    );
  } catch {
    // Ignore storage write errors.
  }
}

function reducer(state: CollapsedState, action: Action): CollapsedState {
  switch (action.type) {
    case "toggle": {
      const next = new Set(state);
      if (next.has(action.key)) {
        next.delete(action.key);
      } else {
        next.add(action.key);
      }
      return next;
    }
    case "set": {
      const next = new Set(state);
      if (action.expanded) {
        next.delete(action.key);
      } else {
        next.add(action.key);
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
      const allowed = new Set(action.keys);
      const previous = new Set(action.previousKeys);
      const next = new Set<string>();

      allowed.forEach((key) => {
        if (state.has(key)) {
          next.add(key);
        } else if (!previous.has(key)) {
          next.add(key);
        }
      });

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
    default:
      return state;
  }
}

function makeNodeKey(type: TreeNodeType, id: string): string {
  return `${type}:${id}`;
}

export interface AnimatableTreeState {
  isExpanded: (type: TreeNodeType, id: string) => boolean;
  toggleNode: (type: TreeNodeType, id: string) => void;
  setExpanded: (type: TreeNodeType, id: string, expanded: boolean) => void;
  syncNodes: (keys: string[]) => void;
}

export function useAnimatableTreeState(
  namespace: string,
  nodes: string[] = [],
): AnimatableTreeState {
  const storageKey = makeStorageKey(namespace);
  const [collapsed, dispatch] = useReducer(reducer, undefined, () =>
    readCollapsedKeys(storageKey),
  );
  const nodesRef = useRef<string[]>([]);

  useEffect(() => {
    persistCollapsedKeys(storageKey, collapsed);
  }, [collapsed, storageKey]);

  useEffect(() => {
    if (!nodes.length) {
      nodesRef.current = [];
      return;
    }
    const previous = nodesRef.current;
    const isSameLength = previous.length === nodes.length;
    let isEqual = isSameLength;
    if (isSameLength) {
      for (let index = 0; index < nodes.length; index += 1) {
        if (previous[index] !== nodes[index]) {
          isEqual = false;
          break;
        }
      }
    }
    if (isEqual) {
      return;
    }
    nodesRef.current = nodes;
    dispatch({ type: "sync", keys: nodes, previousKeys: previous });
  }, [nodes]);

  const isExpanded = useCallback(
    (type: TreeNodeType, id: string) => {
      const key = makeNodeKey(type, id);
      return !collapsed.has(key);
    },
    [collapsed],
  );

  const toggleNode = useCallback((type: TreeNodeType, id: string) => {
    const key = makeNodeKey(type, id);
    dispatch({ type: "toggle", key });
  }, []);

  const setExpanded = useCallback(
    (type: TreeNodeType, id: string, expanded: boolean) => {
      const key = makeNodeKey(type, id);
      dispatch({ type: "set", key, expanded });
    },
    [],
  );

  const syncNodes = useCallback((keys: string[]) => {
    dispatch({ type: "sync", keys, previousKeys: nodesRef.current });
  }, []);

  return {
    isExpanded,
    toggleNode,
    setExpanded,
    syncNodes,
  };
}
