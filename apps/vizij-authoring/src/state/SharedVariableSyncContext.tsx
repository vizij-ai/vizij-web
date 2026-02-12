import { createContext, useContext, type ReactNode } from "react";
import type { UseSharedVariableSyncResult } from "../hooks/useSharedVariableSync";

const defaultSharedVariableSyncState: UseSharedVariableSyncResult = {
  policy: "bidirectional",
  setPolicy: () => {},
  links: [],
  linksByPath: new Map(),
  linksByMainInputId: new Map(),
  linksByReferenceInputId: new Map(),
  outOfSyncCount: 0,
  conflicts: [],
  conflictsByPath: new Map(),
  resolveConflict: () => null,
  dismissConflict: () => {},
};

const SharedVariableSyncContext = createContext<UseSharedVariableSyncResult>(
  defaultSharedVariableSyncState,
);

interface SharedVariableSyncProviderProps {
  value: UseSharedVariableSyncResult;
  children: ReactNode;
}

export function SharedVariableSyncProvider({
  value,
  children,
}: SharedVariableSyncProviderProps) {
  return (
    <SharedVariableSyncContext.Provider value={value}>
      {children}
    </SharedVariableSyncContext.Provider>
  );
}

export function useSharedVariableSyncContext(): UseSharedVariableSyncResult {
  return useContext(SharedVariableSyncContext);
}
