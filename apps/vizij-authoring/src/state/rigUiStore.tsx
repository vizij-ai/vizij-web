import { createContext, useContext, useRef, useSyncExternalStore } from "react";
import type { ReactNode, SetStateAction } from "react";

type RigUiStoreUpdate =
  | Partial<RigUiState>
  | ((state: RigUiState) => Partial<RigUiState> | void);

export interface RigUiState {
  selectedStandardInputRoots: string[];
  selectedStandardInputSubgroups: string[];
  hiddenDriverIds: Set<string>;
  setSelectedStandardInputRoots: (value: SetStateAction<string[]>) => void;
  setSelectedStandardInputSubgroups: (value: SetStateAction<string[]>) => void;
  setHiddenDriverIds: (value: SetStateAction<Set<string>>) => void;
  handleHideDriver: (inputId: string) => void;
  handleShowDriver: (inputId: string) => void;
  handleShowAllDrivers: () => void;
}

export interface RigUiStore {
  getState: () => RigUiState;
  setState: (updater: RigUiStoreUpdate) => void;
  subscribe: (listener: () => void) => () => void;
}

const noop = () => undefined;

const defaultRigUiState: RigUiState = {
  selectedStandardInputRoots: [],
  selectedStandardInputSubgroups: [],
  hiddenDriverIds: new Set(),
  setSelectedStandardInputRoots: noop,
  setSelectedStandardInputSubgroups: noop,
  setHiddenDriverIds: noop,
  handleHideDriver: noop,
  handleShowDriver: noop,
  handleShowAllDrivers: noop,
};

export function createRigUiStore(
  initialState?: Partial<RigUiState>,
): RigUiStore {
  let state: RigUiState = {
    ...defaultRigUiState,
    ...(initialState ?? {}),
  };
  const listeners = new Set<() => void>();

  const setState = (updater: RigUiStoreUpdate) => {
    const patch = typeof updater === "function" ? updater(state) : updater;
    if (!patch) {
      return;
    }

    const nextState = { ...state, ...patch } as RigUiState;
    const hasChanged = Object.keys(patch).some(
      (key) => (state as any)[key] !== (nextState as any)[key],
    );
    if (!hasChanged) {
      return;
    }
    state = nextState;
    listeners.forEach((listener) => listener());
  };

  state.setSelectedStandardInputRoots = (value) => {
    setState((previous) => {
      const next =
        typeof value === "function"
          ? value(previous.selectedStandardInputRoots)
          : value;
      if (previous.selectedStandardInputRoots === next) {
        return;
      }
      return { selectedStandardInputRoots: next };
    });
  };

  state.setSelectedStandardInputSubgroups = (value) => {
    setState((previous) => {
      const next =
        typeof value === "function"
          ? value(previous.selectedStandardInputSubgroups)
          : value;
      if (previous.selectedStandardInputSubgroups === next) {
        return;
      }
      return { selectedStandardInputSubgroups: next };
    });
  };

  state.setHiddenDriverIds = (value) => {
    setState((previous) => {
      const next =
        typeof value === "function" ? value(previous.hiddenDriverIds) : value;
      if (previous.hiddenDriverIds === next) {
        return;
      }
      return { hiddenDriverIds: next };
    });
  };

  state.handleHideDriver = (inputId: string) => {
    state.setHiddenDriverIds((previous) => {
      if (previous.has(inputId)) {
        return previous;
      }
      const next = new Set(previous);
      next.add(inputId);
      return next;
    });
  };

  state.handleShowDriver = (inputId: string) => {
    state.setHiddenDriverIds((previous) => {
      if (!previous.has(inputId)) {
        return previous;
      }
      const next = new Set(previous);
      next.delete(inputId);
      return next;
    });
  };

  state.handleShowAllDrivers = () => {
    state.setHiddenDriverIds((previous) => {
      if (previous.size === 0) {
        return previous;
      }
      return new Set();
    });
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

const RigUiStoreContext = createContext<RigUiStore | null>(null);

interface RigUiStoreProviderProps {
  store: RigUiStore;
  children: ReactNode;
}

export function RigUiStoreProvider({
  store,
  children,
}: RigUiStoreProviderProps) {
  return (
    <RigUiStoreContext.Provider value={store}>
      {children}
    </RigUiStoreContext.Provider>
  );
}

function useRigUiStoreApi(): RigUiStore {
  const store = useContext(RigUiStoreContext);
  if (!store) {
    throw new Error(
      "RigUiStoreProvider is missing. Wrap components with RigControllerProvider.",
    );
  }
  return store;
}

export function useRigUiStore<T>(
  selector: (state: RigUiState) => T,
  equalityFn: (a: T, b: T) => boolean = Object.is,
): T {
  const store = useRigUiStoreApi();
  const lastValueRef = useRef<T | undefined>(undefined);
  const value = useSyncExternalStore(
    store.subscribe,
    () => selector(store.getState()),
    () => selector(store.getState()),
  );
  const previous = lastValueRef.current;
  if (previous !== undefined && equalityFn(previous, value)) {
    return previous;
  }
  lastValueRef.current = value;
  return value;
}
