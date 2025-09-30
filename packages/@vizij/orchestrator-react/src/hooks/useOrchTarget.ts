import { useSyncExternalStore } from "react";
import type { ValueJSON } from "../types";
import { useOrchestrator } from "./useOrchestrator";

export function useOrchTarget(path?: string | null): ValueJSON | undefined {
  const ctx = useOrchestrator();

  return useSyncExternalStore<ValueJSON | undefined>(
    (cb) => {
      if (!path) {
        return () => {};
      }
      return ctx.subscribeToPath(path, cb);
    },
    () => (path ? ctx.getPathSnapshot(path) : undefined),
    () => (path ? ctx.getPathSnapshot(path) : undefined),
  );
}
