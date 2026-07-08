import { createContext, useContext, useRef, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import type { Selection } from "@vizij/render";

type SelectionStoreUpdate =
  | Partial<SelectionState>
  | ((state: SelectionState) => Partial<SelectionState> | void);

export interface SelectionState {
  selectionStack: Selection[];
  handleFocusSelectionIndex: (index: number) => void;
  handleClearSelection: () => void;
}

export interface SelectionStore {
  getState: () => SelectionState;
  setState: (updater: SelectionStoreUpdate) => void;
  subscribe: (listener: () => void) => () => void;
}

const noop = () => undefined;

const defaultSelectionState: SelectionState = {
  selectionStack: [],
  handleFocusSelectionIndex: noop,
  handleClearSelection: noop,
};

export function createSelectionStore(
  initialState?: Partial<SelectionState>,
): SelectionStore {
  let state: SelectionState = {
    ...defaultSelectionState,
    ...(initialState ?? {}),
  };
  const listeners = new Set<() => void>();

  const setState = (updater: SelectionStoreUpdate) => {
    const patch = typeof updater === "function" ? updater(state) : updater;
    if (!patch) {
      return;
    }
    const nextState = { ...state, ...patch } as SelectionState;

    // Check if any value actually changed
    const hasChanged = Object.keys(patch).some(
      (key) => (state as any)[key] !== (nextState as any)[key],
    );

    if (!hasChanged) {
      return;
    }
    state = nextState;
    listeners.forEach((listener) => listener());
  };

  return {
    getState: () => state,
    setState,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

const SelectionStoreContext = createContext<SelectionStore | null>(null);

interface SelectionStoreProviderProps {
  store: SelectionStore;
  children: ReactNode;
}

export function SelectionStoreProvider({
  store,
  children,
}: SelectionStoreProviderProps) {
  return (
    <SelectionStoreContext.Provider value={store}>
      {children}
    </SelectionStoreContext.Provider>
  );
}

function useSelectionStoreApi(): SelectionStore {
  const store = useContext(SelectionStoreContext);
  if (!store) {
    throw new Error(
      "SelectionStoreProvider is missing. Wrap components with RigControllerProvider.",
    );
  }
  return store;
}

export function useSelectionStoreValue<T>(
  selector: (state: SelectionState) => T,
  equalityFn: (a: T, b: T) => boolean = Object.is,
): T {
  const store = useSelectionStoreApi();
  const lastValueRef = useRef<T | undefined>(undefined);
  const subscribe = store.subscribe;
  const getSnapshot = () => selector(store.getState());
  const value = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const previous = lastValueRef.current;
  if (previous !== undefined && equalityFn(previous, value)) {
    return previous;
  }
  lastValueRef.current = value;
  return value;
}
